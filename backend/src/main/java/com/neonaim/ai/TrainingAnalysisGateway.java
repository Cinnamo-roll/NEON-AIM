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
		try {
			TrainingAnalysisProvider.AnalysisResult result = provider.analyze(
					new TrainingAnalysisProvider.AnalysisRequest(snapshot, budget, prompt));
			costGuard.settle(reservation.get(), result.usage());
			try {
				policy.validateResult(snapshot, result, budget, strategy);
			}
			catch (RuntimeException rejected) {
				throw new ModelProviderException("AI_RESPONSE_REJECTED",
						"AI 返回内容未通过数据质量检查，规则建议仍可正常使用",
						rejected, result.usage());
			}
			cache.put(cacheKey, result);
			return new AnalysisOutcome(Status.COMPLETED, result, false, providerId);
		}
		catch (RuntimeException error) {
			costGuard.cancel(reservation.get());
			throw error;
		}
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
