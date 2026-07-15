package com.neonaim.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.neonaim.training.api.TrainingAnalysisSnapshot;
import org.junit.jupiter.api.Test;

class TrainingAnalysisGatewayTests {

	private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-14T04:00:00Z"), ZoneOffset.UTC);
	private static final TrainingAiAnalysisStrategy STRATEGY = new GridShotTrainingAiAnalysisStrategy();
	private static final TrainingAiAnalysisStrategy STRICT_STRATEGY = new TrainingAiAnalysisStrategy() {
		@Override public String trainingId() { return STRATEGY.trainingId(); }
		@Override public PromptSpec prompt(TrainingAnalysisSnapshot.Scope scope) { return STRATEGY.prompt(scope); }
		@Override public void validateTarget(TrainingAnalysisProvider.Target target) { STRATEGY.validateTarget(target); }
	};

	@Test
	void cachedAnalysisDoesNotCallTheProviderOrReserveTokensAgain() {
		StubProvider provider = new StubProvider();
		TrainingAnalysisCostGuard costGuard = new TrainingAnalysisCostGuard(CLOCK, 2_800);
		TrainingAnalysisGateway gateway = gateway(List.of(provider), costGuard);
		TrainingAnalysisSnapshot snapshot = snapshot("session-1", "data-v1");

		TrainingAnalysisGateway.AnalysisOutcome first = gateway.analyze("player-1", snapshot, STRATEGY);
		TrainingAnalysisGateway.AnalysisOutcome cached = gateway.analyze("player-1", snapshot, STRATEGY);

		assertThat(first.status()).isEqualTo(TrainingAnalysisGateway.Status.COMPLETED);
		assertThat(first.cacheHit()).isFalse();
		assertThat(cached.status()).isEqualTo(TrainingAnalysisGateway.Status.COMPLETED);
		assertThat(cached.cacheHit()).isTrue();
		assertThat(provider.calls).isEqualTo(1);
		assertThat(costGuard.remainingTokens("player-1")).isEqualTo(2_520);
	}

	@Test
	void dailyGuardRejectsASecondUncachedCallBeforeTheProviderRuns() {
		StubProvider provider = new StubProvider();
		TrainingAnalysisCostGuard costGuard = new TrainingAnalysisCostGuard(CLOCK, 2_800);
		TrainingAnalysisGateway gateway = gateway(List.of(provider), costGuard);

		gateway.analyze("player-1", snapshot("session-1", "data-v1"), STRATEGY);
		TrainingAnalysisGateway.AnalysisOutcome rejected = gateway.analyze("player-1",
				snapshot("session-2", "data-v2"), STRATEGY);

		assertThat(rejected.status()).isEqualTo(TrainingAnalysisGateway.Status.BUDGET_EXHAUSTED);
		assertThat(rejected.result()).isNull();
		assertThat(provider.calls).isEqualTo(1);
	}

	@Test
	void providerReceivesHardSessionBudgetsAndCompactEvidenceOnly() {
		StubProvider provider = new StubProvider();
		TrainingAnalysisGateway gateway = gateway(List.of(provider),
				new TrainingAnalysisCostGuard(CLOCK, 10_000));

		gateway.analyze("player-1", snapshot("session-1", "data-v1"), STRATEGY);

		TrainingAnalysisProvider.AnalysisRequest request = provider.lastRequest;
		assertThat(request.budget().maxInputTokens()).isEqualTo(1_600);
		assertThat(request.budget().maxOutputTokens()).isEqualTo(1_200);
		assertThat(request.prompt().instructions())
				.contains("headline at most 28 Chinese characters", "no more than three findings",
						"never default to accuracy", "never present 90 accuracy or 75 consistency as universal goals",
						"Never diagnose or speculate", "fatigue", "attention loss",
						"Never expose camelCase keys", "firstAccuracy", "complete sentence");
		assertThat(request.snapshot().windows()).hasSize(3);
		assertThat(request.snapshot().signals()).hasSize(1);
		assertThat(new TrainingAnalysisPolicy().estimateInputTokens(request.snapshot())).isLessThan(900);
	}

	@Test
	void providerInputUsageMayIncludeBoundedPromptOverheadBeyondTheSnapshotLimit() {
		TrainingAnalysisProvider provider = new TrainingAnalysisProvider() {
			@Override
			public AnalysisResult analyze(AnalysisRequest request) {
				AnalysisResult valid = new StubProvider().analyze(request);
				return new AnalysisResult(valid.headline(), valid.summary(), valid.findings(), valid.nextAction(),
						valid.model(), new TokenUsage(1_240, 80));
			}

			@Override public String providerId() { return "prompt-overhead-stub"; }
			@Override public ConnectionResult testConnection() {
				return new ConnectionResult("small-analysis-model", new TokenUsage(4, 2));
			}
		};
		TrainingAnalysisGateway gateway = gateway(List.of(provider),
				new TrainingAnalysisCostGuard(CLOCK, 10_000));

		TrainingAnalysisGateway.AnalysisOutcome outcome = gateway.analyze("player-1",
				snapshot("session-1", "data-v1"), STRATEGY);

		assertThat(outcome.status()).isEqualTo(TrainingAnalysisGateway.Status.COMPLETED);
		assertThat(outcome.result().usage().inputTokens()).isEqualTo(1_240);
	}

	@Test
	void rejectedFirstResponseIsRegeneratedOnceWithDeterministicRepairInstructions() {
		List<TrainingAnalysisProvider.AnalysisRequest> requests = new ArrayList<>();
		TrainingAnalysisProvider provider = new TrainingAnalysisProvider() {
			@Override
			public AnalysisResult analyze(AnalysisRequest request) {
				requests.add(request);
				AnalysisResult valid = new StubProvider().analyze(request);
				if (requests.size() > 1) return valid;
				Finding finding = valid.findings().getFirst();
				return new AnalysisResult(valid.headline(), valid.summary(),
						List.of(new Finding(finding.code(), finding.severity(), finding.title(),
								"Accuracy was 42.7%.", finding.advice())),
						valid.nextAction(), valid.model(), valid.usage());
			}

			@Override
			public String providerId() {
				return "repairing-stub";
			}

			@Override
			public ConnectionResult testConnection() {
				return new ConnectionResult("small-analysis-model", new TokenUsage(4, 2));
			}
		};
		TrainingAnalysisCostGuard costGuard = new TrainingAnalysisCostGuard(CLOCK, 10_000);
		TrainingAnalysisGateway gateway = gateway(List.of(provider), costGuard);

		TrainingAnalysisGateway.AnalysisOutcome outcome = gateway.analyze("player-1",
				snapshot("session-1", "data-v1"), STRICT_STRATEGY);

		assertThat(outcome.status()).isEqualTo(TrainingAnalysisGateway.Status.COMPLETED);
		assertThat(requests).hasSize(2);
		assertThat(requests.getLast().prompt().instructions())
				.contains("previous response failed deterministic validation", "copy at least one numeric literal exactly");
		assertThat(outcome.result().usage()).isEqualTo(new TrainingAnalysisProvider.TokenUsage(400, 160));
		assertThat(costGuard.remainingTokens("player-1")).isEqualTo(9_440);
	}

	@Test
	void careerAnalysisUsesItsOwnBudgetAndReusesTheAggregateCache() {
		StubProvider provider = new StubProvider();
		TrainingAnalysisGateway gateway = gateway(List.of(provider),
				new TrainingAnalysisCostGuard(CLOCK, 10_000));
		TrainingAnalysisSnapshot snapshot = careerSnapshot();

		TrainingAnalysisGateway.AnalysisOutcome first = gateway.analyze("player-1", snapshot, STRATEGY);
		TrainingAnalysisGateway.AnalysisOutcome second = gateway.analyze("player-1", snapshot, STRATEGY);

		assertThat(first.cacheHit()).isFalse();
		assertThat(second.cacheHit()).isTrue();
		assertThat(provider.calls).isEqualTo(1);
		assertThat(provider.lastRequest.budget().maxInputTokens()).isEqualTo(2_800);
		assertThat(provider.lastRequest.budget().maxOutputTokens()).isEqualTo(1_400);
	}

	@Test
	void oversizedSnapshotsAreRejectedBeforeAnyCostIsReserved() {
		StubProvider provider = new StubProvider();
		TrainingAnalysisCostGuard costGuard = new TrainingAnalysisCostGuard(CLOCK, 10_000);
		TrainingAnalysisGateway gateway = gateway(List.of(provider), costGuard);
		TrainingAnalysisSnapshot base = snapshot("session-1", "data-v1");
		List<TrainingAnalysisSnapshot.Window> windows = new ArrayList<>(base.windows());
		while (windows.size() <= TrainingAnalysisPolicy.MAX_WINDOWS) {
			windows.add(windows.getFirst());
		}
		TrainingAnalysisSnapshot oversized = new TrainingAnalysisSnapshot(base.schemaVersion(), base.scope(),
				base.sourceId(), base.dataVersion(), base.trainingId(), base.configurationKey(), base.sampleSize(),
				base.summaryMetrics(), windows, base.signals(), base.comparison(), base.integrity());

		assertThatThrownBy(() -> gateway.analyze("player-1", oversized, STRATEGY))
				.isInstanceOf(IllegalArgumentException.class)
				.hasMessageContaining("too many windows");
		assertThat(provider.calls).isZero();
		assertThat(costGuard.remainingTokens("player-1")).isEqualTo(10_000);
	}

	@Test
	void missingProviderReturnsWithoutSpendingTheDailyBudget() {
		TrainingAnalysisCostGuard costGuard = new TrainingAnalysisCostGuard(CLOCK, 1_320);
		TrainingAnalysisGateway gateway = gateway(List.of(), costGuard);

		TrainingAnalysisGateway.AnalysisOutcome outcome = gateway.analyze("player-1",
				snapshot("session-1", "data-v1"), STRATEGY);

		assertThat(outcome.status()).isEqualTo(TrainingAnalysisGateway.Status.NO_PROVIDER);
		assertThat(costGuard.remainingTokens("player-1")).isEqualTo(1_320);
	}

	@Test
	void rejectedProviderContentStillConsumesItsActualTokenUsage() {
		TrainingAnalysisProvider provider = new TrainingAnalysisProvider() {
			@Override
			public AnalysisResult analyze(AnalysisRequest request) {
				AnalysisResult valid = new StubProvider().analyze(request);
				Finding finding = valid.findings().getFirst();
				return new AnalysisResult(valid.headline(), valid.summary(),
						List.of(new Finding(finding.code(), finding.severity(), finding.title(),
								"Accuracy was 42.7%.", finding.advice())),
						valid.nextAction(), valid.model(), valid.usage());
			}

			@Override
			public String providerId() {
				return "ungrounded-stub";
			}

			@Override
			public ConnectionResult testConnection() {
				return new ConnectionResult("small-analysis-model", new TokenUsage(4, 2));
			}
		};
		TrainingAnalysisCostGuard costGuard = new TrainingAnalysisCostGuard(CLOCK, 2_800);
		TrainingAnalysisGateway gateway = gateway(List.of(provider), costGuard);

		assertThatThrownBy(() -> gateway.analyze("player-1", snapshot("session-1", "data-v1"), STRICT_STRATEGY))
				.isInstanceOf(ModelProviderException.class)
				.hasMessageContaining("AI");
		assertThat(costGuard.remainingTokens("player-1")).isEqualTo(2_520);
	}

	@Test
	void gridShotStrategyRebindsUnsafeModelFieldsWithoutAnotherProviderCall() {
		StubProvider delegate = new StubProvider();
		TrainingAnalysisProvider provider = new TrainingAnalysisProvider() {
			@Override
			public AnalysisResult analyze(AnalysisRequest request) {
				AnalysisResult valid = delegate.analyze(request);
				return new AnalysisResult("反应时间偏慢", "后段下降显示疲劳或注意力分散。",
						List.of(new Finding("INVENTED_PATTERN", Severity.OPPORTUNITY, "目标位置判断偏慢",
								"Accuracy was 42.7%; lastAccuracy:81.4, firstAccuracy:75.8.", "下一局检查瞄准路径。")),
						new NextAction("降低反应时间", "优先调整反应时间。",
								List.of(new Target("accuracy", "准确率", Operator.AT_MOST, 40, "%"))),
						valid.model(), valid.usage());
			}

			@Override public String providerId() { return "grid-recovery-stub"; }
			@Override public ConnectionResult testConnection() {
				return new ConnectionResult("small-analysis-model", new TokenUsage(4, 2));
			}
		};
		TrainingAnalysisGateway gateway = gateway(List.of(provider),
				new TrainingAnalysisCostGuard(CLOCK, 2_800));

		TrainingAnalysisGateway.AnalysisOutcome outcome = gateway.analyze("player-1",
				snapshot("session-1", "data-v1"), STRATEGY);

		assertThat(outcome.status()).isEqualTo(TrainingAnalysisGateway.Status.COMPLETED);
		assertThat(outcome.result().findings().getFirst().evidence()).doesNotContain("42.7");
		assertThat(outcome.result().findings().getFirst().evidence())
				.doesNotContain("lastAccuracy", "firstAccuracy");
		assertThat(outcome.result().headline()).doesNotContain("反应时间");
		assertThat(outcome.result().summary()).doesNotContain("疲劳", "注意力分散");
		assertThat(outcome.result().findings().getFirst().code()).isEqualTo("LATE_ACCURACY_DROP");
		assertThat(outcome.result().nextAction().targets().getFirst())
				.extracting(TrainingAnalysisProvider.Target::metric, TrainingAnalysisProvider.Target::operator)
				.containsExactly("lastPhaseAccuracy", TrainingAnalysisProvider.Operator.AT_LEAST);
		assertThat(delegate.calls).isEqualTo(1);
	}

	@Test
	void gridShotStrategyKeepsUpToThreeFindingsWithTheExpandedPrompt() {
		TrainingAiAnalysisStrategy.PromptSpec prompt = STRATEGY.prompt(TrainingAnalysisSnapshot.Scope.SESSION);
		TrainingAnalysisProvider.AnalysisResult supplied = new TrainingAnalysisProvider.AnalysisResult(
				"本局存在三个可验证观察", "结合本局与近期记录给出更完整的分析。",
				List.of(
						new TrainingAnalysisProvider.Finding("LATE_ACCURACY_DROP",
								TrainingAnalysisProvider.Severity.OPPORTUNITY, "后段准确率下降",
								"后段变化需要重新校准。", "下一局保持后段节奏。"),
						new TrainingAnalysisProvider.Finding("PACE_CONTEXT",
								TrainingAnalysisProvider.Severity.POSITIVE, "当前速度可用",
								"速度表现需要结合准确率判断。", "保持当前速度。"),
						new TrainingAnalysisProvider.Finding("CONSISTENCY_CONTEXT",
								TrainingAnalysisProvider.Severity.OPPORTUNITY, "稳定性仍可提升",
								"稳定性需要结合阶段数据判断。", "维持均匀点击节奏。")),
				new TrainingAnalysisProvider.NextAction("守住后段准确率", "只保留一个下一局训练重点。",
						List.of(new TrainingAnalysisProvider.Target("lastPhaseAccuracy", "后段准确率",
								TrainingAnalysisProvider.Operator.AT_LEAST, 90, "%"))),
				"small-analysis-model", new TrainingAnalysisProvider.TokenUsage(300, 260));

		TrainingAnalysisProvider.AnalysisResult recovered = STRATEGY
				.recoverRejectedResult(snapshot("session-three-findings", "data-v1"), supplied)
				.orElseThrow();

		assertThat(prompt.promptVersion()).isEqualTo("grid-shot-session-v11");
		assertThat(prompt.instructions()).contains("no more than three findings", "summary at most 140 Chinese characters");
		assertThat(recovered.findings()).hasSize(3);
	}

	private static TrainingAnalysisGateway gateway(List<TrainingAnalysisProvider> providers,
			TrainingAnalysisCostGuard costGuard) {
		return new TrainingAnalysisGateway(providers, new TrainingAnalysisPolicy(),
				new InMemoryTrainingAnalysisCache(100), costGuard);
	}

	private static TrainingAnalysisSnapshot snapshot(String sourceId, String dataVersion) {
		List<TrainingAnalysisSnapshot.Window> windows = List.of(
				window("phase1", 0, 20_000, 94.2, 132),
				window("phase2", 20_000, 40_000, 91.8, 141),
				window("phase3", 40_000, 60_000, 87.8, 138));
		return new TrainingAnalysisSnapshot(1, TrainingAnalysisSnapshot.Scope.SESSION, sourceId, dataVersion,
				"grid-shot", "grid-shot:60s:medium", 1,
				Map.of("score", 18_420d, "accuracy", 91.3d, "targetsPerMinute", 137d,
						"consistencyScore", 78d, "averageHitInterval", 438d),
				windows,
				List.of(new TrainingAnalysisSnapshot.Signal("LATE_ACCURACY_DROP",
						TrainingAnalysisSnapshot.Severity.OPPORTUNITY,
						Map.of("firstAccuracy", 94.2d, "lastAccuracy", 87.8d, "accuracyDelta", -6.4d))),
				new TrainingAnalysisSnapshot.Comparison(5,
						Map.of("scoreDeltaPercent", 4.2d, "accuracyDelta", -1.3d)),
				new TrainingAnalysisSnapshot.Integrity(true, List.of()));
	}

	private static TrainingAnalysisSnapshot careerSnapshot() {
		return new TrainingAnalysisSnapshot(1, TrainingAnalysisSnapshot.Scope.CAREER,
				"career:player-1:grid-shot", "career-data-v1", "grid-shot", "grid-shot:mixed", 4,
				Map.of("sampleSize", 4d, "comparableSampleSize", 1d, "configurationCount", 4d,
						"averageAccuracy", 82.1d, "averageTargetsPerMinute", 169d),
				List.of(
						new TrainingAnalysisSnapshot.Window("S01|30s|large", 0, 1_000,
								Map.of("accuracy", 87.8d, "scorePerMinute", 23_950d)),
						new TrainingAnalysisSnapshot.Window("S02|60s|medium", 1_000, 2_000,
								Map.of("accuracy", 82.4d, "scorePerMinute", 21_640d))),
				List.of(new TrainingAnalysisSnapshot.Signal("LOW_SAMPLE",
						TrainingAnalysisSnapshot.Severity.WARNING,
						Map.of("sampleSize", 4d, "comparableSampleSize", 1d, "accuracyDelta", -6.4d))),
				null, new TrainingAnalysisSnapshot.Integrity(true, List.of()));
	}

	private static TrainingAnalysisSnapshot.Window window(String label, long startMs, long endMs,
			double accuracy, double targetsPerMinute) {
		return new TrainingAnalysisSnapshot.Window(label, startMs, endMs,
				Map.of("accuracy", accuracy, "targetsPerMinute", targetsPerMinute));
	}

	private static final class StubProvider implements TrainingAnalysisProvider {

		private int calls;
		private AnalysisRequest lastRequest;

		@Override
		public AnalysisResult analyze(AnalysisRequest request) {
			calls += 1;
			lastRequest = request;
			if (request.snapshot().scope() == TrainingAnalysisSnapshot.Scope.CAREER) {
				return new AnalysisResult("当前仅能初步观察", "不同配置样本较少。",
						List.of(new Finding("LOW_SAMPLE", Severity.WARNING,
								"同配置样本不足", "共 4 局，同配置最多 1 局。", "先固定配置继续训练。")),
						new NextAction("固定配置积累样本", "保持训练条件一致。",
								List.of(new Target("accuracy", "准确率", Operator.AT_LEAST, 85, "%"))),
						"small-analysis-model", new TokenUsage(260, 90));
			}
			return new AnalysisResult("先稳定后段命中", "后段准确率出现下降。",
					List.of(new Finding("LATE_ACCURACY_DROP", Severity.OPPORTUNITY,
							"后段准确率下降", "后20秒准确率下降6.4个百分点", "下一局先稳定后段节奏。")),
					new NextAction("守住后段准确率", "速度不变，减少后段无效点击。",
							List.of(new Target("lastPhaseAccuracy", "后段准确率", Operator.AT_LEAST, 90, "%"))),
					"small-analysis-model", new TokenUsage(200, 80));
		}

		@Override
		public String providerId() {
			return "stub";
		}

		@Override
		public ConnectionResult testConnection() {
			return new ConnectionResult("small-analysis-model", new TokenUsage(4, 2));
		}
	}
}
