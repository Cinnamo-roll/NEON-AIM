package com.neonaim.ai;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

import com.neonaim.training.api.TrainingAnalysisSnapshot;

/**
 * Cost-aware orchestration entry point. It validates bounded input, reuses
 * cached analysis and reserves the worst-case token budget before calling a
 * model provider.
 */
public final class TrainingAnalysisGateway {

	private static final String REPAIR_INSTRUCTIONS = """

			The previous response failed deterministic validation. Regenerate the complete JSON from scratch.
			Report only observable metric changes. Do not infer fatigue, attention loss, distraction, anxiety,
			physical condition, mental state, or hardware causes from performance data.
			Never expose internal camelCase field names or key:value dumps in user-facing text or target labels;
			translate every metric into a natural-language label and complete sentence.
			For each finding, reuse a supplied signals[].code whenever it describes that signal. Every other finding.evidence
			must copy at least one numeric literal exactly from the supplied snapshot; do not round, recalculate, or introduce
			another number. averageHitInterval is a hit interval, never reaction time. Use only the allowed target metrics and
			operators, keep values inside their natural ranges, and return one to three findings plus one or two targets.
			""";

	private final List<TrainingAnalysisProvider> providers;
	private final TrainingAnalysisPolicy policy;
	private final TrainingAnalysisCache cache;
	private final TrainingAnalysisCostGuard costGuard;

	public TrainingAnalysisGateway(List<TrainingAnalysisProvider> providers, TrainingAnalysisPolicy policy,
			TrainingAnalysisCache cache, TrainingAnalysisCostGuard costGuard) {
		this.providers = List.copyOf(Objects.requireNonNull(providers, "providers"));
		this.policy = Objects.requireNonNull(policy, "policy");
		this.cache = Objects.requireNonNull(cache, "cache");
		this.costGuard = Objects.requireNonNull(costGuard, "costGuard");
	}

	public AnalysisOutcome analyze(String ownerKey, TrainingAnalysisSnapshot snapshot,
			TrainingAiAnalysisStrategy strategy) {
		if (providers.isEmpty()) {
			return new AnalysisOutcome(Status.NO_PROVIDER, null, false, null);
		}
		return analyze(ownerKey, snapshot, strategy, providers.getFirst());
	}

	public AnalysisOutcome analyze(String ownerKey, TrainingAnalysisSnapshot snapshot,
			TrainingAiAnalysisStrategy strategy,
			TrainingAnalysisProvider provider) {
		policy.validate(Objects.requireNonNull(snapshot, "snapshot"));
		Objects.requireNonNull(strategy, "strategy");
		if (!snapshot.trainingId().equals(strategy.trainingId())) {
			throw new IllegalArgumentException("AI strategy does not match the training snapshot");
		}
		TrainingAiAnalysisStrategy.PromptSpec prompt = strategy.prompt(snapshot.scope());
		Objects.requireNonNull(provider, "provider");
		String providerId = provider.providerId();
		if (providerId == null || providerId.isBlank()) {
			throw new IllegalStateException("providerId must not be blank");
		}
		TrainingAnalysisCache.CacheKey cacheKey = new TrainingAnalysisCache.CacheKey(snapshot.scope(),
				snapshot.sourceId(), snapshot.dataVersion(), prompt.promptVersion(), providerId);
		Optional<TrainingAnalysisProvider.AnalysisResult> cached = cache.find(cacheKey);
		if (cached.isPresent()) {
			return new AnalysisOutcome(Status.COMPLETED, cached.get(), true, providerId);
		}

		TrainingAnalysisPolicy.TokenBudget budget = policy.budgetFor(snapshot.scope());
		Optional<TrainingAnalysisCostGuard.Reservation> reservation = costGuard.tryReserve(ownerKey,
				budget.maximumTotalTokens());
		if (reservation.isEmpty()) {
			return new AnalysisOutcome(Status.BUDGET_EXHAUSTED, null, false, providerId);
		}
		TrainingAnalysisProvider.AnalysisResult result = invokeProvider(provider, snapshot, budget, prompt,
				reservation.get());
		try {
			policy.validateResult(snapshot, result, budget, strategy);
		}
		catch (RuntimeException rejected) {
			Optional<TrainingAnalysisProvider.AnalysisResult> recovered = recoverWithStrategy(
					snapshot, strategy, result, budget);
			result = recovered.isPresent() ? recovered.get()
					: repairRejectedResult(ownerKey, snapshot, strategy, provider, prompt, budget,
							result.usage(), rejected);
		}
		cache.put(cacheKey, result);
		return new AnalysisOutcome(Status.COMPLETED, result, false, providerId);
	}

	private TrainingAnalysisProvider.AnalysisResult repairRejectedResult(String ownerKey,
			TrainingAnalysisSnapshot snapshot, TrainingAiAnalysisStrategy strategy,
			TrainingAnalysisProvider provider, TrainingAiAnalysisStrategy.PromptSpec prompt,
			TrainingAnalysisPolicy.TokenBudget budget, TrainingAnalysisProvider.TokenUsage firstUsage,
			RuntimeException firstRejection) {
		Optional<TrainingAnalysisCostGuard.Reservation> reservation = costGuard.tryReserve(ownerKey,
				budget.maximumTotalTokens());
		if (reservation.isEmpty()) {
			throw rejected(firstRejection, firstUsage);
		}
		TrainingAiAnalysisStrategy.PromptSpec repairPrompt = new TrainingAiAnalysisStrategy.PromptSpec(
				prompt.promptVersion(), prompt.engineVersion(), prompt.instructions() + REPAIR_INSTRUCTIONS,
				prompt.supportedTargetMetrics());
		TrainingAnalysisProvider.AnalysisResult repaired;
		try {
			repaired = invokeProvider(provider, snapshot, budget, repairPrompt, reservation.get());
		}
		catch (ModelProviderException error) {
			throw new ModelProviderException(error.code(), error.getMessage(), error,
					combine(firstUsage, error.usage()));
		}
		TrainingAnalysisProvider.TokenUsage combinedUsage = combine(firstUsage, repaired.usage());
		try {
			policy.validateResult(snapshot, repaired, budget, strategy);
		}
		catch (RuntimeException finalRejection) {
			Optional<TrainingAnalysisProvider.AnalysisResult> recovered = recoverWithStrategy(
					snapshot, strategy, repaired, budget);
			if (recovered.isPresent()) return withUsage(recovered.get(), combinedUsage);
			throw rejected(finalRejection, combinedUsage);
		}
		return withUsage(repaired, combinedUsage);
	}

	private Optional<TrainingAnalysisProvider.AnalysisResult> recoverWithStrategy(
			TrainingAnalysisSnapshot snapshot, TrainingAiAnalysisStrategy strategy,
			TrainingAnalysisProvider.AnalysisResult rejectedResult, TrainingAnalysisPolicy.TokenBudget budget) {
		try {
			Optional<TrainingAnalysisProvider.AnalysisResult> recovered = strategy.recoverRejectedResult(
					snapshot, rejectedResult);
			if (recovered.isEmpty()) return Optional.empty();
			policy.validateResult(snapshot, recovered.get(), budget, strategy);
			return recovered;
		}
		catch (RuntimeException ignored) {
			return Optional.empty();
		}
	}

	private TrainingAnalysisProvider.AnalysisResult invokeProvider(TrainingAnalysisProvider provider,
			TrainingAnalysisSnapshot snapshot, TrainingAnalysisPolicy.TokenBudget budget,
			TrainingAiAnalysisStrategy.PromptSpec prompt, TrainingAnalysisCostGuard.Reservation reservation) {
		try {
			TrainingAnalysisProvider.AnalysisResult result = provider.analyze(
					new TrainingAnalysisProvider.AnalysisRequest(snapshot, budget, prompt));
			costGuard.settle(reservation, result.usage());
			return result;
		}
		catch (ModelProviderException error) {
			if (error.usage().totalTokens() > 0) costGuard.settle(reservation, error.usage());
			else costGuard.cancel(reservation);
			throw error;
		}
		catch (RuntimeException error) {
			costGuard.cancel(reservation);
			throw error;
		}
	}

	private static TrainingAnalysisProvider.AnalysisResult withUsage(
			TrainingAnalysisProvider.AnalysisResult result, TrainingAnalysisProvider.TokenUsage usage) {
		return new TrainingAnalysisProvider.AnalysisResult(result.headline(), result.summary(), result.findings(),
				result.nextAction(), result.model(), usage);
	}

	private static TrainingAnalysisProvider.TokenUsage combine(TrainingAnalysisProvider.TokenUsage first,
			TrainingAnalysisProvider.TokenUsage second) {
		return new TrainingAnalysisProvider.TokenUsage(
				Math.addExact(first.inputTokens(), second.inputTokens()),
				Math.addExact(first.outputTokens(), second.outputTokens()));
	}

	private static ModelProviderException rejected(RuntimeException cause,
			TrainingAnalysisProvider.TokenUsage usage) {
		return new ModelProviderException("AI_RESPONSE_REJECTED",
				"AI 返回内容未通过数据质量检查，请重新分析", cause, usage);
	}

	public enum Status {
		COMPLETED,
		NO_PROVIDER,
		BUDGET_EXHAUSTED
	}

	public record AnalysisOutcome(Status status, TrainingAnalysisProvider.AnalysisResult result,
			boolean cacheHit, String providerId) {
	}
}
