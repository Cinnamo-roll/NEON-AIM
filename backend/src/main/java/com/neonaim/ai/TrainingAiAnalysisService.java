package com.neonaim.ai;

import com.neonaim.training.api.TrainingAnalysisResult;
import com.neonaim.training.api.TrainingSessionAnalysisOperations;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.stereotype.Service;

@Service
class TrainingAiAnalysisService {

	static final String PROMPT_VERSION = "grid-shot-session-v5";
	private static final String ENGINE_VERSION = "ai-analysis-v1";
	private static final Duration STALE_PENDING_AFTER = Duration.ofMinutes(2);

	private final TrainingSessionAnalysisOperations trainingOperations;
	private final TrainingAiAnalysisCallRepository callRepository;
	private final TrainingAnalysisGateway gateway;
	private final TrainingAnalysisProviderRegistry providerRegistry;
	private final Executor executor;
	private final Clock clock;

	TrainingAiAnalysisService(TrainingSessionAnalysisOperations trainingOperations,
			TrainingAiAnalysisCallRepository callRepository, TrainingAnalysisGateway gateway,
			TrainingAnalysisProviderRegistry providerRegistry,
			@Qualifier("trainingAiExecutor") Executor executor, Clock clock) {
		this.trainingOperations = trainingOperations;
		this.callRepository = callRepository;
		this.gateway = gateway;
		this.providerRegistry = providerRegistry;
		this.executor = executor;
		this.clock = clock;
	}

	JobView trigger(UUID userId, UUID sessionId, String providerName, String apiKey, String model) {
		TrainingSessionAnalysisOperations.AnalysisContext context =
				trainingOperations.loadAnalysisContext(userId, sessionId);
		TrainingAiAnalysisCall pending = callRepository
				.findFirstByUserIdAndSessionIdAndStatusOrderByCreatedAtDesc(
						userId, sessionId, TrainingAiAnalysisCall.Status.PENDING)
				.orElse(null);
		if (pending != null && !isStale(pending)) {
			return view(pending, context.currentAnalysis(), context.snapshot());
		}
		if (pending != null) {
			pending.fail("AI_JOB_INTERRUPTED", "上一次 AI 分析未完成，请重新生成", clock.instant());
			callRepository.save(pending);
		}

		TrainingAnalysisProvider provider = providerRegistry.create(providerName, apiKey, model);
		TrainingAiAnalysisCall call = callRepository.saveAndFlush(new TrainingAiAnalysisCall(userId, sessionId,
				provider.providerId(), model, PROMPT_VERSION, context.snapshot().dataVersion(), clock.instant()));
		try {
			executor.execute(() -> analyze(call.id(), userId, sessionId, providerName, apiKey, model));
		}
		catch (TaskRejectedException exception) {
			call.fail("AI_QUEUE_FULL", "AI 分析任务较多，请稍后重试", clock.instant());
			callRepository.save(call);
		}
		return view(call, context.currentAnalysis(), context.snapshot());
	}

	JobView latest(UUID userId, UUID sessionId) {
		TrainingSessionAnalysisOperations.AnalysisContext context =
				trainingOperations.loadAnalysisContext(userId, sessionId);
		TrainingAiAnalysisCall latest = callRepository
				.findFirstByUserIdAndSessionIdOrderByCreatedAtDesc(userId, sessionId)
				.orElse(null);
		if (latest == null) {
			return JobView.notRequested(context.currentAnalysis(), context.snapshot());
		}
		if (latest.status() == TrainingAiAnalysisCall.Status.PENDING && isStale(latest)) {
			latest.fail("AI_JOB_INTERRUPTED", "AI 分析任务已中断，请重新生成", clock.instant());
			callRepository.save(latest);
		}
		return view(latest, context.currentAnalysis(), context.snapshot());
	}

	private void analyze(UUID callId, UUID userId, UUID sessionId, String providerName,
			String apiKey, String model) {
		TrainingAiAnalysisCall call = callRepository.findById(callId).orElse(null);
		if (call == null || call.status() != TrainingAiAnalysisCall.Status.PENDING) {
			return;
		}
		try {
			TrainingSessionAnalysisOperations.AnalysisContext context =
					trainingOperations.loadAnalysisContext(userId, sessionId);
			TrainingAnalysisProvider provider = providerRegistry.create(providerName, apiKey, model);
			TrainingAnalysisGateway.AnalysisOutcome outcome = gateway.analyze(userId.toString(),
					context.snapshot(), PROMPT_VERSION, provider);
			if (outcome.status() == TrainingAnalysisGateway.Status.BUDGET_EXHAUSTED) {
				call.budgetExhausted(clock.instant());
				callRepository.save(call);
				return;
			}
			if (outcome.status() != TrainingAnalysisGateway.Status.COMPLETED || outcome.result() == null) {
				call.fail("AI_PROVIDER_UNAVAILABLE", "AI 分析服务暂不可用，规则建议仍可正常使用", clock.instant());
				callRepository.save(call);
				return;
			}
			TrainingAnalysisResult result = toTrainingResult(outcome.providerId(), outcome.result());
			trainingOperations.applyAiAnalysis(userId, sessionId, result);
			call.complete(outcome.result().usage(), outcome.cacheHit(), clock.instant());
			callRepository.save(call);
		}
		catch (ModelProviderException exception) {
			call.fail(exception.code(), safeMessage(exception), exception.usage(), clock.instant());
			callRepository.save(call);
		}
		catch (RuntimeException exception) {
			call.fail("AI_ANALYSIS_FAILED", "AI 深度分析失败，规则建议仍可正常使用", clock.instant());
			callRepository.save(call);
		}
	}

	private TrainingAnalysisResult toTrainingResult(String providerId,
			TrainingAnalysisProvider.AnalysisResult providerResult) {
		List<TrainingAnalysisResult.Finding> findings = providerResult.findings().stream()
				.map(finding -> new TrainingAnalysisResult.Finding(finding.code(),
						TrainingAnalysisResult.Severity.valueOf(finding.severity().name()),
						finding.title(), finding.evidence(), finding.advice()))
				.toList();
		List<TrainingAnalysisResult.Target> targets = providerResult.nextAction().targets().stream()
				.map(target -> new TrainingAnalysisResult.Target(target.metric(), target.label(),
						TrainingAnalysisResult.Operator.valueOf(target.operator().name()),
						target.value(), target.unit()))
				.toList();
		return new TrainingAnalysisResult(TrainingAnalysisResult.CURRENT_SCHEMA_VERSION,
				TrainingAnalysisResult.Status.READY, TrainingAnalysisResult.Source.AI, ENGINE_VERSION,
				providerId, providerResult.model(), PROMPT_VERSION, providerResult.headline(),
				providerResult.summary(), findings,
				new TrainingAnalysisResult.NextAction(providerResult.nextAction().title(),
						providerResult.nextAction().description(), targets),
				new TrainingAnalysisResult.TokenUsage(providerResult.usage().inputTokens(),
						providerResult.usage().outputTokens()), clock.instant());
	}

	private boolean isStale(TrainingAiAnalysisCall call) {
		return call.createdAt().plus(STALE_PENDING_AFTER).isBefore(clock.instant());
	}

	private static String safeMessage(ModelProviderException exception) {
		String message = exception.getMessage();
		if (message == null || message.isBlank()) {
			return "AI 深度分析失败，规则建议仍可正常使用";
		}
		return message.length() <= 400 ? message : message.substring(0, 400);
	}

	private static JobView view(TrainingAiAnalysisCall call, TrainingAnalysisResult analysis,
			com.neonaim.training.api.TrainingAnalysisSnapshot snapshot) {
		int comparisonSampleSize = snapshot.comparison() == null ? 0 : snapshot.comparison().sampleSize();
		return new JobView(call.id(), JobStatus.valueOf(call.status().name()), call.cacheHit(),
				call.providerId(), call.modelName(), call.promptVersion(), call.inputTokens(),
				call.outputTokens(), call.durationMs(), call.failureCode(), call.failureMessage(),
				confidence(comparisonSampleSize), comparisonSampleSize, analysis, call.createdAt(), call.completedAt());
	}

	private static Confidence confidence(int comparisonSampleSize) {
		if (comparisonSampleSize >= 5) return Confidence.ESTABLISHED;
		if (comparisonSampleSize >= 2) return Confidence.DEVELOPING;
		return Confidence.SINGLE_SESSION;
	}

	enum JobStatus { NOT_REQUESTED, PENDING, READY, FAILED, BUDGET_EXHAUSTED }
	enum Confidence { SINGLE_SESSION, DEVELOPING, ESTABLISHED }

	record JobView(UUID callId, JobStatus status, boolean cacheHit, String providerId, String model,
			String promptVersion, int inputTokens, int outputTokens, Long durationMs,
			String failureCode, String failureMessage, Confidence confidence, int comparisonSampleSize,
			TrainingAnalysisResult analysis,
			Instant createdAt, Instant completedAt) {

		static JobView notRequested(TrainingAnalysisResult analysis,
				com.neonaim.training.api.TrainingAnalysisSnapshot snapshot) {
			int comparisonSampleSize = snapshot.comparison() == null ? 0 : snapshot.comparison().sampleSize();
			return new JobView(null, JobStatus.NOT_REQUESTED, false, null, null, null,
					0, 0, null, null, null, TrainingAiAnalysisService.confidence(comparisonSampleSize), comparisonSampleSize,
					analysis, null, null);
		}
	}
}
