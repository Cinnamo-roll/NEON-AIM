package com.neonaim.ai;

import com.neonaim.common.error.ApiException;
import com.neonaim.training.api.TrainingAnalysisResult;
import com.neonaim.training.api.TrainingCoachingTaskOperations;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@Service
class TrainingCoachingTaskService implements TrainingCoachingTaskOperations {

	private static final TypeReference<List<TrainingAnalysisResult.Target>> TARGET_LIST = new TypeReference<>() { };
	private static final TypeReference<Evaluation> EVALUATION_TYPE = new TypeReference<>() { };
	private static final TypeReference<List<Evaluation>> ATTEMPT_LIST = new TypeReference<>() { };

	private final TrainingCoachingTaskRepository taskRepository;
	private final TrainingCareerAiAnalysisCallRepository analysisRepository;
	private final ObjectMapper objectMapper;
	private final Clock clock;
	private final TrainingCoachingPolicyRegistry policyRegistry;

	@Autowired
	TrainingCoachingTaskService(TrainingCoachingTaskRepository taskRepository,
			TrainingCareerAiAnalysisCallRepository analysisRepository,
			ObjectMapper objectMapper, Clock clock, TrainingCoachingPolicyRegistry policyRegistry) {
		this.taskRepository = taskRepository;
		this.analysisRepository = analysisRepository;
		this.objectMapper = objectMapper;
		this.clock = clock;
		this.policyRegistry = policyRegistry;
	}

	TrainingCoachingTaskService(TrainingCoachingTaskRepository taskRepository,
			TrainingCareerAiAnalysisCallRepository analysisRepository,
			ObjectMapper objectMapper, Clock clock) {
		this(taskRepository, analysisRepository, objectMapper, clock,
				new TrainingCoachingPolicyRegistry(List.of(new GridShotTrainingCoachingPolicy())));
	}

	@Transactional
	TaskView adopt(UUID userId, String trainingId, UUID analysisCallId) {
		TrainingCoachingPolicy policy = policyRegistry.require(trainingId);
		TrainingCareerAiAnalysisCall call = analysisRepository.findByIdAndUserId(analysisCallId, userId)
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "CAREER_ANALYSIS_NOT_FOUND",
						"这份综合分析不存在"));
		if (!trainingId.equals(call.trainingId()) || call.status() != TrainingCareerAiAnalysisCall.Status.READY) {
			throw new ApiException(HttpStatus.CONFLICT, "CAREER_ANALYSIS_NOT_READY", "这份综合分析尚不能转为训练目标");
		}
		if (!policy.supportsAnalysisSource(call)) {
			throw new ApiException(HttpStatus.CONFLICT, "CAREER_ANALYSIS_NOT_COMPARABLE",
					"请先用基准训练记录生成综合分析");
		}
		TrainingAnalysisResult analysis = readAnalysis(call.resultJson());
		if (analysis.source() != TrainingAnalysisResult.Source.AI
				|| analysis.status() != TrainingAnalysisResult.Status.READY) {
			throw new ApiException(HttpStatus.CONFLICT, "CAREER_ANALYSIS_NOT_READY", "这份综合分析尚不能转为训练目标");
		}
		validateTargets(policy, analysis.nextAction().targets());
		Instant activatedAt = clock.instant();
		for (TrainingCoachingTask active : taskRepository.findByUserIdAndTrainingIdAndStatus(
				userId, trainingId, TrainingCoachingTask.Status.ACTIVE)) {
			active.cancel(activatedAt);
		}
		TrainingCoachingTask task = new TrainingCoachingTask(userId, trainingId, call.id(),
				call.dataVersion(), policy.configurationKey(),
				policy.modeVersion(), policy.scoringVersion(),
				analysis.nextAction().title(), analysis.nextAction().description(),
				writeJson(analysis.nextAction().targets()), activatedAt);
		return view(taskRepository.save(task));
	}

	@Transactional(readOnly = true)
	TaskView latest(UUID userId, String trainingId) {
		policyRegistry.require(trainingId);
		TrainingCoachingTask task = taskRepository
				.findFirstByUserIdAndTrainingIdAndStatusOrderByActivatedAtDesc(
						userId, trainingId, TrainingCoachingTask.Status.ACTIVE)
				.orElseGet(() -> taskRepository
						.findFirstByUserIdAndTrainingIdOrderByActivatedAtDesc(userId, trainingId)
						.orElse(null));
		return task == null ? null : view(task);
	}

	@Override
	@Transactional
	public void evaluateCompletedSession(CompletedSession session) {
		if (!session.integrityPassed()) return;
		TrainingCoachingTask task = taskRepository
				.findFirstByUserIdAndTrainingIdAndStatusOrderByActivatedAtDesc(
						session.userId(), session.trainingId(), TrainingCoachingTask.Status.ACTIVE)
				.orElse(null);
		if (task == null || !matches(task, session)) return;

		List<TrainingAnalysisResult.Target> targets = readTargets(task.targetsJson());
		List<Evaluation> attempts = new ArrayList<>(readAttempts(task.attemptsJson()));
		if (attempts.stream().anyMatch(attempt -> attempt.sessionId().equals(session.sessionId()))) return;
		List<TargetEvaluation> targetResults = targets.stream().map(target -> {
			double actual = session.metrics().getOrDefault(target.metric(), Double.NaN);
			if (!Double.isFinite(actual)) {
				throw new IllegalStateException("completed session is missing metric " + target.metric());
			}
			boolean passed = target.operator() == TrainingAnalysisResult.Operator.AT_LEAST
					? actual >= target.value() : actual <= target.value();
			return new TargetEvaluation(target.metric(), target.label(), target.operator(),
					target.value(), target.unit(), actual, passed);
		}).toList();
		long passedTargets = targetResults.stream().filter(TargetEvaluation::passed).count();
		TrainingCoachingTask.EvaluationStatus status = passedTargets == targetResults.size()
				? TrainingCoachingTask.EvaluationStatus.ACHIEVED
				: passedTargets == 0 ? TrainingCoachingTask.EvaluationStatus.NOT_ACHIEVED
				: TrainingCoachingTask.EvaluationStatus.PARTIAL;
		Evaluation attempt = new Evaluation(session.sessionId(), status, targetResults, session.completedAt());
		attempts.add(attempt);
		task.recordAttempts(writeJson(attempts), session.completedAt());

		Progress progress = progress(task, targets, attempts);
		boolean achieved = progress.targets().stream().allMatch(TargetProgress::achieved);
		boolean exhausted = progress.attemptsCompleted() >= progress.maxAttempts();
		if (!achieved && !exhausted) return;

		TrainingCoachingTask.EvaluationStatus cycleStatus = achieved
				? TrainingCoachingTask.EvaluationStatus.ACHIEVED
				: progress.targets().stream().anyMatch(target -> target.passCount() > 0)
						? TrainingCoachingTask.EvaluationStatus.PARTIAL
						: TrainingCoachingTask.EvaluationStatus.NOT_ACHIEVED;
		List<TargetEvaluation> cycleTargets = progress.targets().stream()
				.map(target -> new TargetEvaluation(target.metric(), target.label(), target.operator(),
						target.targetValue(), target.unit(), target.bestValue(), target.achieved()))
				.toList();
		Evaluation evaluation = new Evaluation(session.sessionId(), cycleStatus, cycleTargets,
				session.completedAt());
		task.complete(cycleStatus, session.sessionId(), writeJson(evaluation), session.completedAt());
	}

	private static boolean matches(TrainingCoachingTask task, CompletedSession session) {
		return !session.startedAt().isBefore(task.activatedAt())
				&& task.configurationKey().equals(session.configurationKey())
				&& task.modeVersion() == session.modeVersion()
				&& task.scoringVersion() == session.scoringVersion();
	}

	private static void validateTargets(TrainingCoachingPolicy policy,
			List<TrainingAnalysisResult.Target> targets) {
		if (targets.isEmpty() || targets.size() > 3
				|| targets.stream().anyMatch(target -> !policy.supportedMetrics().contains(target.metric()))
				|| targets.stream().map(TrainingAnalysisResult.Target::metric).distinct().count() != targets.size()) {
			throw new ApiException(HttpStatus.CONFLICT, "CAREER_TARGET_UNSUPPORTED",
					"这份分析包含暂时无法自动验收的目标，请重新生成综合分析");
		}
	}

	private TrainingAnalysisResult readAnalysis(String resultJson) {
		if (resultJson == null || resultJson.isBlank()) {
			throw new ApiException(HttpStatus.CONFLICT, "CAREER_ANALYSIS_NOT_READY", "这份综合分析尚不能转为训练目标");
		}
		try {
			return objectMapper.readValue(resultJson, TrainingAnalysisResult.class);
		}
		catch (JacksonException exception) {
			throw new IllegalStateException("stored career analysis is invalid", exception);
		}
	}

	private List<TrainingAnalysisResult.Target> readTargets(String json) {
		try {
			return objectMapper.readValue(json, TARGET_LIST);
		}
		catch (JacksonException exception) {
			throw new IllegalStateException("stored coaching targets are invalid", exception);
		}
	}

	private Evaluation readEvaluation(String json) {
		if (json == null || json.isBlank()) return null;
		try {
			return objectMapper.readValue(json, EVALUATION_TYPE);
		}
		catch (JacksonException exception) {
			throw new IllegalStateException("stored coaching evaluation is invalid", exception);
		}
	}

	private List<Evaluation> readAttempts(String json) {
		if (json == null || json.isBlank()) return List.of();
		try {
			return objectMapper.readValue(json, ATTEMPT_LIST);
		}
		catch (JacksonException exception) {
			throw new IllegalStateException("stored coaching attempts are invalid", exception);
		}
	}

	private String writeJson(Object value) {
		try {
			return objectMapper.writeValueAsString(value);
		}
		catch (JacksonException exception) {
			throw new IllegalStateException("coaching task cannot be serialized", exception);
		}
	}

	private TaskView view(TrainingCoachingTask task) {
		List<TrainingAnalysisResult.Target> targets = readTargets(task.targetsJson());
		Evaluation evaluation = readEvaluation(task.evaluationJson());
		List<Evaluation> attempts = readAttempts(task.attemptsJson());
		if (attempts.isEmpty() && evaluation != null) attempts = List.of(evaluation);
		return new TaskView(task.id(), task.status(), task.sourceAnalysisCallId(), task.title(),
				task.description(), task.configurationKey(), task.modeVersion(), task.scoringVersion(),
				targets, task.activatedAt(), progress(task, targets, attempts), evaluation);
	}

	private static Progress progress(TrainingCoachingTask task,
			List<TrainingAnalysisResult.Target> targets, List<Evaluation> attempts) {
		List<TargetProgress> targetProgress = targets.stream().map(target -> {
			List<TargetEvaluation> values = attempts.stream()
					.flatMap(attempt -> attempt.targets().stream())
					.filter(value -> value.metric().equals(target.metric()))
					.toList();
			int passCount = (int) values.stream().filter(TargetEvaluation::passed).count();
			Double latestValue = values.isEmpty() ? null : values.getLast().actualValue();
			Double bestValue = values.isEmpty() ? null : target.operator() == TrainingAnalysisResult.Operator.AT_LEAST
					? values.stream().mapToDouble(TargetEvaluation::actualValue).max().orElseThrow()
					: values.stream().mapToDouble(TargetEvaluation::actualValue).min().orElseThrow();
			return new TargetProgress(target.metric(), target.label(), target.operator(),
					target.value(), target.unit(), passCount, task.requiredPasses(),
					latestValue, bestValue, passCount >= task.requiredPasses());
		}).toList();
		return new Progress(attempts.size(), task.maxAttempts(),
				task.status() == TrainingCoachingTask.Status.ACTIVE
						? Math.max(0, task.maxAttempts() - attempts.size()) : 0,
				task.requiredPasses(),
				targetProgress, attempts);
	}

	record TaskView(UUID id, TrainingCoachingTask.Status status, UUID sourceAnalysisCallId,
			String title, String description, String configurationKey, int modeVersion,
			int scoringVersion, List<TrainingAnalysisResult.Target> targets,
			Instant activatedAt, Progress progress, Evaluation evaluation) {
	}

	record Progress(int attemptsCompleted, int maxAttempts, int remainingAttempts,
			int requiredPasses, List<TargetProgress> targets, List<Evaluation> attempts) {
	}

	record TargetProgress(String metric, String label, TrainingAnalysisResult.Operator operator,
			double targetValue, String unit, int passCount, int requiredPasses,
			Double latestValue, Double bestValue, boolean achieved) {
	}

	record Evaluation(UUID sessionId, TrainingCoachingTask.EvaluationStatus status,
			List<TargetEvaluation> targets, Instant evaluatedAt) {
	}

	record TargetEvaluation(String metric, String label, TrainingAnalysisResult.Operator operator,
			double targetValue, String unit, double actualValue, boolean passed) {
	}
}
