package com.neonaim.ai;

import com.neonaim.training.api.TrainingAnalysisResult;
import com.neonaim.training.api.TrainingCareerAnalysisOperations;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Service
class TrainingCareerAiAnalysisService {

	private static final Logger LOGGER = LoggerFactory.getLogger(TrainingCareerAiAnalysisService.class);
	private static final String PROMPT_VERSION = "grid-shot-career-v2";
	private static final String ENGINE_VERSION = "grid-shot-career-ai-v2";
	private static final Duration STALE_PENDING_AFTER = Duration.ofMinutes(2);

	private final TrainingCareerAnalysisOperations trainingOperations;
	private final TrainingAnalysisProviderRegistry providerRegistry;
	private final TrainingAnalysisGateway gateway;
	private final TrainingCareerAiAnalysisCallRepository callRepository;
	private final ObjectMapper objectMapper;
	private final Executor executor;
	private final Clock clock;

	TrainingCareerAiAnalysisService(TrainingCareerAnalysisOperations trainingOperations,
			TrainingAnalysisProviderRegistry providerRegistry, TrainingAnalysisGateway gateway,
			TrainingCareerAiAnalysisCallRepository callRepository, ObjectMapper objectMapper,
			@Qualifier("trainingAiExecutor") Executor executor, Clock clock) {
		this.trainingOperations = trainingOperations;
		this.providerRegistry = providerRegistry;
		this.gateway = gateway;
		this.callRepository = callRepository;
		this.objectMapper = objectMapper;
		this.executor = executor;
		this.clock = clock;
	}

	JobView trigger(UUID userId, String trainingId, String providerName, String apiKey, String model) {
		TrainingCareerAnalysisOperations.CareerContext context =
				trainingOperations.loadCareerAnalysisContext(userId, trainingId);
		TrainingCareerAiAnalysisCall pending = callRepository
				.findFirstByUserIdAndTrainingIdAndStatusOrderByCreatedAtDesc(
						userId, trainingId, TrainingCareerAiAnalysisCall.Status.PENDING)
				.orElse(null);
		if (pending != null && !isStale(pending)
				&& pending.dataVersion().equals(context.snapshot().dataVersion())) {
			return view(pending, null, false);
		}
		if (pending != null) {
			pending.fail("AI_JOB_INTERRUPTED", "上一份综合分析未完成，请重新生成", clock.instant());
			callRepository.save(pending);
		}

		TrainingAnalysisProvider provider = providerRegistry.create(providerName, apiKey, model);
		TrainingCareerAiAnalysisCall call = callRepository.saveAndFlush(new TrainingCareerAiAnalysisCall(
				userId, context.anchorSessionId(), trainingId, context.snapshot().sourceId(),
				context.snapshot().dataVersion(), provider.providerId(), model, PROMPT_VERSION,
				context.confidence().name(), context.sampleSize(), context.comparableSampleSize(),
				context.configurationCount(), clock.instant()));
		try {
			executor.execute(() -> analyze(call.id(), userId, trainingId, providerName, apiKey, model));
		}
		catch (TaskRejectedException exception) {
			call.fail("AI_QUEUE_FULL", "AI 分析任务较多，请稍后重试", clock.instant());
			callRepository.save(call);
		}
		return view(call, null, false);
	}

	JobView latest(UUID userId, String trainingId) {
		TrainingCareerAnalysisOperations.CareerContext context =
				trainingOperations.loadCareerAnalysisContext(userId, trainingId);
		TrainingCareerAiAnalysisCall latest = callRepository
				.findFirstByUserIdAndTrainingIdOrderByCreatedAtDesc(userId, trainingId)
				.orElse(null);
		if (latest == null) {
			return JobView.notRequested(context);
		}
		if (latest.status() == TrainingCareerAiAnalysisCall.Status.PENDING && isStale(latest)) {
			latest.fail("AI_JOB_INTERRUPTED", "AI 综合分析已中断，请重新生成", clock.instant());
			callRepository.save(latest);
		}
		boolean stale = !latest.dataVersion().equals(context.snapshot().dataVersion());
		return view(latest, readResult(latest.resultJson()), stale);
	}

	private void analyze(UUID callId, UUID userId, String trainingId, String providerName,
			String apiKey, String model) {
		TrainingCareerAiAnalysisCall call = callRepository.findById(callId).orElse(null);
		if (call == null || call.status() != TrainingCareerAiAnalysisCall.Status.PENDING) return;
		try {
			TrainingCareerAnalysisOperations.CareerContext context =
					trainingOperations.loadCareerAnalysisContext(userId, trainingId);
			if (!call.dataVersion().equals(context.snapshot().dataVersion())) {
				call.fail("CAREER_DATA_CHANGED", "训练记录已变化，请重新生成综合分析", clock.instant());
				callRepository.save(call);
				return;
			}
			TrainingAnalysisProvider provider = providerRegistry.create(providerName, apiKey, model);
			TrainingAnalysisGateway.AnalysisOutcome outcome = gateway.analyze(userId.toString(),
					context.snapshot(), PROMPT_VERSION, provider);
			if (outcome.status() == TrainingAnalysisGateway.Status.BUDGET_EXHAUSTED) {
				call.budgetExhausted(clock.instant());
				callRepository.save(call);
				return;
			}
			if (outcome.status() != TrainingAnalysisGateway.Status.COMPLETED || outcome.result() == null) {
				call.fail("AI_PROVIDER_UNAVAILABLE", "AI 综合分析服务暂时不可用", clock.instant());
				callRepository.save(call);
				return;
			}
			TrainingAnalysisResult result = toTrainingResult(outcome.providerId(), outcome.result());
			call.complete(outcome.result().usage(), outcome.cacheHit(), writeResult(result), clock.instant());
			callRepository.save(call);
		}
		catch (ModelProviderException exception) {
			call.fail(exception.code(), safeMessage(exception), exception.usage(), clock.instant());
			callRepository.save(call);
		}
		catch (RuntimeException exception) {
			LOGGER.error("Career AI analysis failed for call {}", callId, exception);
			call.fail("AI_ANALYSIS_FAILED", "AI 综合分析失败，请稍后重试", clock.instant());
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

	private String writeResult(TrainingAnalysisResult result) {
		try {
			return objectMapper.writeValueAsString(result);
		}
		catch (JacksonException exception) {
			throw new IllegalStateException("career analysis cannot be serialized", exception);
		}
	}

	private TrainingAnalysisResult readResult(String resultJson) {
		if (resultJson == null || resultJson.isBlank()) return null;
		try {
			return objectMapper.readValue(resultJson, TrainingAnalysisResult.class);
		}
		catch (JacksonException exception) {
			throw new IllegalStateException("stored career analysis is invalid", exception);
		}
	}

	private boolean isStale(TrainingCareerAiAnalysisCall call) {
		return call.createdAt().plus(STALE_PENDING_AFTER).isBefore(clock.instant());
	}

	private static String safeMessage(ModelProviderException exception) {
		String message = exception.getMessage();
		if (message == null || message.isBlank()) return "AI 综合分析失败，请稍后重试";
		return message.length() <= 400 ? message : message.substring(0, 400);
	}

	private static JobView view(TrainingCareerAiAnalysisCall call, TrainingAnalysisResult analysis,
			boolean stale) {
		return new JobView(call.id(), JobStatus.valueOf(call.status().name()), call.cacheHit(), stale,
				call.providerId(), call.modelName(), call.promptVersion(), call.confidence(),
				call.sampleSize(), call.comparableSampleSize(), call.configurationCount(),
				call.inputTokens(), call.outputTokens(), call.durationMs(), call.failureCode(),
				call.failureMessage(), analysis, call.createdAt(), call.completedAt());
	}

	enum JobStatus { NOT_REQUESTED, PENDING, READY, FAILED, BUDGET_EXHAUSTED }

	record JobView(UUID callId, JobStatus status, boolean cacheHit, boolean stale,
			String providerId, String model, String promptVersion, String confidence,
			int sampleSize, int comparableSampleSize, int configurationCount,
			int inputTokens, int outputTokens, Long durationMs, String failureCode,
			String failureMessage, TrainingAnalysisResult analysis, Instant createdAt,
			Instant completedAt) {

		static JobView notRequested(TrainingCareerAnalysisOperations.CareerContext context) {
			return new JobView(null, JobStatus.NOT_REQUESTED, false, false, null, null, null,
					context.confidence().name(), context.sampleSize(), context.comparableSampleSize(),
					context.configurationCount(), 0, 0, null, null, null, null, null, null);
		}
	}
}
