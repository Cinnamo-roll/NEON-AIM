package com.neonaim.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.neonaim.training.api.TrainingAnalysisResult;
import com.neonaim.training.api.TrainingAnalysisSnapshot;
import com.neonaim.training.api.TrainingSessionAnalysisOperations;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class TrainingAiAnalysisServiceTests {

	private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-14T06:00:00Z"), ZoneOffset.UTC);

	@Test
	void repeatedRequestUsesCacheAndRecordsZeroTokensForTheSecondCall() {
		Fixture fixture = fixture(false);

		fixture.service.trigger(fixture.userId, fixture.sessionId);
		TrainingAiAnalysisService.JobView first = fixture.service.latest(fixture.userId, fixture.sessionId);
		fixture.service.trigger(fixture.userId, fixture.sessionId);
		TrainingAiAnalysisService.JobView second = fixture.service.latest(fixture.userId, fixture.sessionId);

		assertThat(first.status()).isEqualTo(TrainingAiAnalysisService.JobStatus.READY);
		assertThat(first.confidence()).isEqualTo(TrainingAiAnalysisService.Confidence.SINGLE_SESSION);
		assertThat(first.comparisonSampleSize()).isZero();
		assertThat(first.analysis().source()).isEqualTo(TrainingAnalysisResult.Source.AI);
		assertThat(first.inputTokens()).isEqualTo(300);
		assertThat(second.status()).isEqualTo(TrainingAiAnalysisService.JobStatus.READY);
		assertThat(second.cacheHit()).isTrue();
		assertThat(second.inputTokens()).isZero();
		assertThat(second.outputTokens()).isZero();
		assertThat(fixture.providerCalls.get()).isEqualTo(1);
	}

	@Test
	void reportsEstablishedConfidenceForFiveComparableSessions() {
		Fixture fixture = fixture(false, false, 5);

		TrainingAiAnalysisService.JobView view = fixture.service.latest(fixture.userId, fixture.sessionId);

		assertThat(view.status()).isEqualTo(TrainingAiAnalysisService.JobStatus.NOT_REQUESTED);
		assertThat(view.confidence()).isEqualTo(TrainingAiAnalysisService.Confidence.ESTABLISHED);
		assertThat(view.comparisonSampleSize()).isEqualTo(5);
	}

	@Test
	void providerFailureKeepsTheRuleAnalysisAvailable() {
		Fixture fixture = fixture(true);

		fixture.service.trigger(fixture.userId, fixture.sessionId);
		TrainingAiAnalysisService.JobView failed = fixture.service.latest(fixture.userId, fixture.sessionId);

		assertThat(failed.status()).isEqualTo(TrainingAiAnalysisService.JobStatus.FAILED);
		assertThat(failed.failureCode()).isEqualTo("AI_API_KEY_INVALID");
		assertThat(failed.analysis().source()).isEqualTo(TrainingAnalysisResult.Source.RULES);
		assertThat(failed.analysis().usage().totalTokens()).isZero();
	}

	@Test
	void rejectedAiResultStillRecordsTheTokensAlreadySpent() {
		Fixture fixture = fixture(false, true);

		fixture.service.trigger(fixture.userId, fixture.sessionId);
		TrainingAiAnalysisService.JobView failed = fixture.service.latest(fixture.userId, fixture.sessionId);

		assertThat(failed.status()).isEqualTo(TrainingAiAnalysisService.JobStatus.FAILED);
		assertThat(failed.failureCode()).isEqualTo("AI_RESPONSE_REJECTED");
		assertThat(failed.inputTokens()).isEqualTo(300);
		assertThat(failed.outputTokens()).isEqualTo(120);
		assertThat(failed.analysis().source()).isEqualTo(TrainingAnalysisResult.Source.RULES);
		assertThat(fixture.providerCalls.get()).isEqualTo(1);
	}

	private static Fixture fixture(boolean failProvider) {
		return fixture(failProvider, false);
	}

	private static Fixture fixture(boolean failProvider, boolean ungroundedResult) {
		return fixture(failProvider, ungroundedResult, 0);
	}

	private static Fixture fixture(boolean failProvider, boolean ungroundedResult, int comparisonSampleSize) {
		UUID userId = UUID.randomUUID();
		UUID sessionId = UUID.randomUUID();
		TrainingAnalysisSnapshot snapshot = snapshot(sessionId, comparisonSampleSize);
		AtomicReference<TrainingAnalysisResult> current = new AtomicReference<>(rules());
		TrainingSessionAnalysisOperations operations = mock(TrainingSessionAnalysisOperations.class);
		when(operations.loadAnalysisContext(userId, sessionId)).thenAnswer(ignored ->
				new TrainingSessionAnalysisOperations.AnalysisContext(sessionId, snapshot, current.get()));
		org.mockito.Mockito.doAnswer(invocation -> {
			current.set(invocation.getArgument(2));
			return null;
		}).when(operations).applyAiAnalysis(any(UUID.class), any(UUID.class), any(TrainingAnalysisResult.class));

		List<TrainingAiAnalysisCall> calls = new ArrayList<>();
		TrainingAiAnalysisCallRepository repository = mock(TrainingAiAnalysisCallRepository.class);
		when(repository.findFirstByUserIdAndSessionIdAndStatusOrderByCreatedAtDesc(
				any(UUID.class), any(UUID.class), any(TrainingAiAnalysisCall.Status.class))).thenReturn(Optional.empty());
		when(repository.saveAndFlush(any(TrainingAiAnalysisCall.class))).thenAnswer(invocation -> {
			TrainingAiAnalysisCall call = invocation.getArgument(0);
			calls.add(call);
			return call;
		});
		when(repository.save(any(TrainingAiAnalysisCall.class))).thenAnswer(invocation -> invocation.getArgument(0));
		when(repository.findById(any(UUID.class))).thenAnswer(invocation -> calls.stream()
				.filter(call -> call.id().equals(invocation.getArgument(0))).findFirst());
		when(repository.findFirstByUserIdAndSessionIdOrderByCreatedAtDesc(userId, sessionId))
				.thenAnswer(ignored -> calls.isEmpty() ? Optional.empty() : Optional.of(calls.getLast()));

		AtomicReference<Integer> providerCalls = new AtomicReference<>(0);
		TrainingAnalysisProvider provider = new TrainingAnalysisProvider() {
			@Override
			public AnalysisResult analyze(AnalysisRequest request) {
				providerCalls.set(providerCalls.get() + 1);
				if (failProvider) throw new ModelProviderException("AI_API_KEY_INVALID", "API Key 无效");
				return ungroundedResult ? ungroundedProviderResult() : providerResult();
			}

			@Override
			public String providerId() {
				return "openai-responses:gpt-4o-mini";
			}

			@Override
			public ConnectionResult testConnection() {
				return new ConnectionResult("gpt-4o-mini", new TokenUsage(4, 2));
			}
		};
		TrainingAnalysisProviderRegistry providerRegistry = mock(TrainingAnalysisProviderRegistry.class);
		when(providerRegistry.create(anyString(), anyString(), anyString())).thenReturn(provider);
		AiProviderSettingsService providerSettings = mock(AiProviderSettingsService.class);
		when(providerSettings.requireCredentials()).thenReturn(new AiProviderSettingsService.Credentials(
				"openai", "sk-test-user-key-value", "gpt-4o-mini"));
		TrainingAnalysisGateway gateway = new TrainingAnalysisGateway(List.of(), new TrainingAnalysisPolicy(),
				new InMemoryTrainingAnalysisCache(20), new TrainingAnalysisCostGuard(CLOCK, 10_000));
		TrainingAiAnalysisService service = new TrainingAiAnalysisService(operations, repository, gateway,
				providerRegistry, providerSettings, Runnable::run, CLOCK);
		return new Fixture(service, userId, sessionId, providerCalls);
	}

	private static TrainingAnalysisProvider.AnalysisResult providerResult() {
		return new TrainingAnalysisProvider.AnalysisResult("先稳定后段命中", "后段准确率出现下降。",
				List.of(new TrainingAnalysisProvider.Finding("LATE_ACCURACY_DROP",
						TrainingAnalysisProvider.Severity.OPPORTUNITY, "后段命中下降",
						"第三阶段准确率 87.8%。", "保持速度，减少后段无效点击。")),
				new TrainingAnalysisProvider.NextAction("守住后段准确率", "下一局保持后段节奏。",
						List.of(new TrainingAnalysisProvider.Target("lastPhaseAccuracy", "后段准确率",
								TrainingAnalysisProvider.Operator.AT_LEAST, 90, "%"))),
				"gpt-4o-mini", new TrainingAnalysisProvider.TokenUsage(300, 120));
	}

	private static TrainingAnalysisProvider.AnalysisResult ungroundedProviderResult() {
		TrainingAnalysisProvider.AnalysisResult valid = providerResult();
		TrainingAnalysisProvider.Finding finding = valid.findings().getFirst();
		return new TrainingAnalysisProvider.AnalysisResult(valid.headline(), valid.summary(),
				List.of(new TrainingAnalysisProvider.Finding(finding.code(), finding.severity(), finding.title(),
						"Accuracy was 42.7%.", finding.advice())),
				valid.nextAction(), valid.model(), valid.usage());
	}

	private static TrainingAnalysisResult rules() {
		return TrainingAnalysisResult.rules("grid-shot-rules-v1", "先稳住准确率", "即时规则建议。",
				List.of(new TrainingAnalysisResult.Finding("ACCURACY_LIMITS_PACE",
						TrainingAnalysisResult.Severity.OPPORTUNITY, "准确率优先", "准确率 84%。", "减少无效点击。")),
				new TrainingAnalysisResult.NextAction("准确率达到 90%", "保持当前速度。",
						List.of(new TrainingAnalysisResult.Target("accuracy", "准确率",
								TrainingAnalysisResult.Operator.AT_LEAST, 90, "%"))), CLOCK.instant());
	}

	private static TrainingAnalysisSnapshot snapshot(UUID sessionId, int comparisonSampleSize) {
		return new TrainingAnalysisSnapshot(1, TrainingAnalysisSnapshot.Scope.SESSION, sessionId.toString(), "data-v1",
				"grid-shot", "grid-shot:60s:medium", 120,
				Map.of("accuracy", 91.3, "targetsPerMinute", 137d, "consistencyScore", 78d),
				List.of(new TrainingAnalysisSnapshot.Window("phase1", 0, 20_000, Map.of("accuracy", 94.2)),
						new TrainingAnalysisSnapshot.Window("phase2", 20_000, 40_000, Map.of("accuracy", 91.9)),
						new TrainingAnalysisSnapshot.Window("phase3", 40_000, 60_000, Map.of("accuracy", 87.8))),
				List.of(new TrainingAnalysisSnapshot.Signal("LATE_ACCURACY_DROP",
						TrainingAnalysisSnapshot.Severity.OPPORTUNITY, Map.of("accuracyDelta", -6.4))),
				comparisonSampleSize > 0
						? new TrainingAnalysisSnapshot.Comparison(comparisonSampleSize, Map.of("accuracyDelta", 2.1))
						: null,
				new TrainingAnalysisSnapshot.Integrity(true, List.of()));
	}

	private record Fixture(TrainingAiAnalysisService service, UUID userId, UUID sessionId,
			AtomicReference<Integer> providerCalls) {
	}
}
