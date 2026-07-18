package com.neonaim.training;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.neonaim.ai.TrainingAnalysisPolicy;
import com.neonaim.training.api.TrainingAnalysisSnapshot;
import com.neonaim.training.api.TrainingCareerAnalysisOperations;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import tools.jackson.databind.ObjectMapper;

class TrainingCareerAnalysisSnapshotTests {

	private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-14T10:00:00Z"), ZoneOffset.UTC);

	@Test
	void careerAiUsesAllValidHistoryWithoutMixingConfigurationsIntoATrend() {
		UUID userId = UUID.randomUUID();
		TrainingSessionRepository repository = mock(TrainingSessionRepository.class);
		List<TrainingCareerSessionView> sessions = List.of(
				careerSession(session("grid-shot:30s:small", 30_000, 8_795, 78.5, 146, 396.2, 60, "practice")),
				careerSession(session("grid-shot:90s:medium", 90_000, 32_385, 79.6, 172, 347.8, 68, "practice")),
				careerSession(session("grid-shot:60s:medium", 60_000, 21_640, 82.4, 173, 345.6, 69, "benchmark")),
				careerSession(session("grid-shot:30s:large", 30_000, 11_975, 87.7, 186, 307.9, 74, "practice")));
		when(repository.findCareerSessionsByUserIdAndTrainingId(
				eq(userId), eq("grid-shot"), any(Pageable.class)))
				.thenReturn(new PageImpl<>(sessions));
		when(repository.findCareerCohortAggregates(
				eq(userId), eq("grid-shot"), eq(TrainingSession.IntegrityStatus.VALID)))
				.thenReturn(sessions.stream().map(TrainingCareerAnalysisSnapshotTests::aggregate).toList());
		when(repository.findRecentValidCareerSessions(
				eq(userId), eq("grid-shot"), eq(TrainingSession.IntegrityStatus.VALID), any(Pageable.class)))
				.thenReturn(sessions);
		TrainingCareerProfileService service = new TrainingCareerProfileService(repository,
				new ObjectMapper(), CLOCK);

		TrainingCareerProfileService.ProfileView profile = service.profile(userId, "grid-shot");
		TrainingCareerAnalysisOperations.CareerContext context =
				service.loadCareerAnalysisContext(userId, "grid-shot");
		TrainingAnalysisSnapshot snapshot = context.snapshot();

		assertThat(profile.sample().comparableSessions()).isEqualTo(1);
		assertThat(profile.sample().configurationCount()).isEqualTo(4);
		assertThat(context.sampleSize()).isEqualTo(4);
		assertThat(context.comparableSampleSize()).isEqualTo(1);
		assertThat(context.configurationCount()).isEqualTo(4);
		assertThat(context.confidence()).isEqualTo(TrainingCareerAnalysisOperations.Confidence.INITIAL);
		assertThat(snapshot.sourceId()).contains(":all-history");
		assertThat(snapshot.configurationKey()).isEqualTo("grid-shot:all-history");
		assertThat(snapshot.summaryMetrics())
				.containsEntry("validSessionCount", 4d)
				.containsEntry("standardSessionCount", 1d)
				.containsEntry("practiceSessionCount", 3d)
				.containsEntry("configurationCount", 4d);
		assertThat(snapshot.windows()).hasSize(4)
				.allSatisfy(window -> assertThat(window.label()).startsWith("R"));
		assertThat(snapshot.comparison()).isNull();
		new TrainingAnalysisPolicy().validate(snapshot);
	}

	@Test
	void careerAiBuildsRecentChangeOnlyInsideExactComparableCohorts() {
		UUID userId = UUID.randomUUID();
		TrainingSessionRepository repository = mock(TrainingSessionRepository.class);
		List<TrainingCareerSessionView> sessions = List.of(
				careerSession(session("grid-shot:60s:medium", 60_000, 22_400, 86, 184, 326, 78, "practice")),
				careerSession(session("grid-shot:60s:medium", 60_000, 22_000, 85, 181, 332, 75, "practice")),
				careerSession(session("grid-shot:60s:medium", 60_000, 21_600, 84, 178, 337, 71, "practice")),
				careerSession(session("grid-shot:60s:medium", 60_000, 21_000, 83, 174, 344, 66, "practice")),
				careerSession(session("grid-shot:60s:medium", 60_000, 20_700, 82, 171, 351, 62, "practice")),
				careerSession(session("grid-shot:60s:medium", 60_000, 20_300, 81, 168, 357, 59, "practice")),
				careerSession(session("grid-shot:60s:medium", 60_000, 12_500, 91, 195, 302, 90, "practice")));
		List<TrainingCareerSessionView> recentSix = sessions.subList(0, 6);
		when(repository.findCareerSessionsByUserIdAndTrainingId(
				eq(userId), eq("grid-shot"), any(Pageable.class)))
				.thenReturn(new PageImpl<>(sessions));
		when(repository.findCareerCohortAggregates(
				eq(userId), eq("grid-shot"), eq(TrainingSession.IntegrityStatus.VALID)))
				.thenReturn(List.of(aggregate(sessions)));
		when(repository.findRecentValidCareerSessions(
				eq(userId), eq("grid-shot"), eq(TrainingSession.IntegrityStatus.VALID), any(Pageable.class)))
				.thenReturn(recentSix);
		when(repository.findRecentValidCareerSessionsForCohort(
				eq(userId), eq("grid-shot"), eq("grid-shot:60s:medium"), eq(1), eq(1),
				eq(TrainingSession.IntegrityStatus.VALID), any(Pageable.class)))
				.thenReturn(recentSix);
		TrainingCareerProfileService service = new TrainingCareerProfileService(repository,
				new ObjectMapper(), CLOCK);

		TrainingCareerAnalysisOperations.CareerContext context =
				service.loadCareerAnalysisContext(userId, "grid-shot");
		TrainingAnalysisSnapshot snapshot = context.snapshot();

		assertThat(context.confidence()).isEqualTo(TrainingCareerAnalysisOperations.Confidence.LOW);
		assertThat(context.sampleSize()).isEqualTo(7);
		assertThat(context.comparableSampleSize()).isEqualTo(7);
		assertThat(context.configurationCount()).isEqualTo(1);
		assertThat(snapshot.summaryMetrics())
				.containsEntry("validSessionCount", 7d)
				.containsEntry("practiceSessionCount", 7d)
				.containsEntry("recentAccuracy", 83.5d);
		assertThat(snapshot.windows()).hasSize(6)
				.allSatisfy(window -> assertThat(window.metrics())
						.containsKeys("scorePerMinute", "lastPhaseAccuracy", "phaseAccuracyChange")
						.doesNotContainKey("score"));
		assertThat(snapshot.signals()).extracting(TrainingAnalysisSnapshot.Signal::code)
				.contains("RECENT_IMPROVEMENT", "ACCURACY_LIMITS_PACE")
				.doesNotContain("TRAINING_HISTORY_FOUNDATION");
		assertThat(snapshot.comparison()).isNotNull();
		assertThat(snapshot.comparison().sampleSize()).isEqualTo(6);
		assertThat(snapshot.comparison().deltas()).containsEntry("accuracyDelta", 3d);
		assertThat(snapshot.summaryMetrics().values()).allSatisfy(
				TrainingCareerAnalysisSnapshotTests::assertPresentationPrecision);
		assertThat(snapshot.windows()).allSatisfy(window -> assertThat(window.metrics().values())
				.allSatisfy(TrainingCareerAnalysisSnapshotTests::assertPresentationPrecision));
		assertThat(snapshot.signals()).allSatisfy(signal -> assertThat(signal.evidence().values())
				.allSatisfy(TrainingCareerAnalysisSnapshotTests::assertPresentationPrecision));
		assertThat(snapshot.comparison().deltas().values()).allSatisfy(
				TrainingCareerAnalysisSnapshotTests::assertPresentationPrecision);
		new TrainingAnalysisPolicy().validate(snapshot);
	}

	private static void assertPresentationPrecision(double value) {
		assertThat(BigDecimal.valueOf(value).stripTrailingZeros().scale()).isLessThanOrEqualTo(2);
	}

	private static TrainingSession session(String configurationKey, long durationMs, double score,
			double accuracy, double targetsPerMinute, double hitInterval, double consistency,
			String sessionType) {
		TrainingSession session = mock(TrainingSession.class);
		UUID id = UUID.randomUUID();
		when(session.id()).thenReturn(id);
		when(session.modeVersion()).thenReturn(1);
		when(session.scoringVersion()).thenReturn(1);
		when(session.configurationKey()).thenReturn(configurationKey);
		when(session.sessionType()).thenReturn(sessionType);
		when(session.durationMs()).thenReturn(durationMs);
		when(session.score()).thenReturn(score);
		when(session.accuracy()).thenReturn(accuracy);
		when(session.targetsPerMinute()).thenReturn(targetsPerMinute);
		when(session.averageHitInterval()).thenReturn(hitInterval);
		when(session.consistencyScore()).thenReturn(consistency);
		when(session.maxCombo()).thenReturn(20);
		when(session.analysisDataVersion()).thenReturn("version-" + id);
		when(session.analysisSnapshotJson()).thenReturn("""
				{"windows":[{"accuracy":%.1f},{"accuracy":%.1f},{"accuracy":%.1f}]}
				""".formatted(accuracy + 1, accuracy, accuracy - 1));
		when(session.integrityStatus()).thenReturn(TrainingSession.IntegrityStatus.VALID);
		when(session.completedAt()).thenReturn(Instant.parse("2026-07-14T09:00:00Z"));
		return session;
	}

	private static TrainingCareerSessionView careerSession(TrainingSession session) {
		return new TrainingCareerSessionView(session.id(), session.configurationKey(), session.sessionType(),
				session.modeVersion(), session.scoringVersion(), session.completedAt(), session.score(),
				session.durationMs(), session.accuracy(), session.targetsPerMinute(), session.averageHitInterval(),
				session.consistencyScore(), session.maxCombo(), session.integrityStatus(),
				session.analysisSnapshotJson(), session.analysisDataVersion());
	}

	private static TrainingCareerCohortAggregateView aggregate(TrainingCareerSessionView session) {
		return aggregate(List.of(session));
	}

	private static TrainingCareerCohortAggregateView aggregate(List<TrainingCareerSessionView> sessions) {
		TrainingCareerSessionView first = sessions.getFirst();
		return new TrainingCareerCohortAggregateView(first.configurationKey(), first.modeVersion(),
				first.scoringVersion(), first.sessionType(), sessions.size(),
				sessions.stream().mapToLong(TrainingCareerSessionView::durationMs).sum(),
				sessions.stream().mapToDouble(TrainingCareerAnalysisSnapshotTests::scorePerMinute).average().orElse(0),
				sessions.stream().mapToDouble(TrainingCareerAnalysisSnapshotTests::scorePerMinute).max().orElse(0),
				sessions.stream().mapToDouble(TrainingCareerSessionView::accuracy).average().orElse(0),
				sessions.stream().mapToDouble(TrainingCareerSessionView::targetsPerMinute).average().orElse(0),
				sessions.stream().mapToDouble(TrainingCareerSessionView::averageHitInterval).average().orElse(0),
				sessions.stream().mapToDouble(TrainingCareerSessionView::consistencyScore).average().orElse(0),
				sessions.stream().mapToDouble(TrainingCareerSessionView::maxCombo).average().orElse(0));
	}

	private static double scorePerMinute(TrainingCareerSessionView session) {
		return session.score() * 60_000d / session.durationMs();
	}
}
