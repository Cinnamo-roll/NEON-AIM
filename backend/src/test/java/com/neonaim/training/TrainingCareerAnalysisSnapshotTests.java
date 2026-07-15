package com.neonaim.training;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.neonaim.ai.TrainingAnalysisPolicy;
import com.neonaim.common.error.ApiException;
import com.neonaim.training.api.TrainingAnalysisSnapshot;
import com.neonaim.training.api.TrainingCareerAnalysisOperations;
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
	void profileUsesValidSessionsWithoutRequiringBenchmarkAndKeepsConfigurationsSeparate() {
		UUID userId = UUID.randomUUID();
		TrainingSessionRepository repository = mock(TrainingSessionRepository.class);
		List<TrainingSession> sessions = List.of(
				session("grid-shot:30s:small", 30_000, 8_795, 78.5, 146, 396.2, 6),
				session("grid-shot:90s:medium", 90_000, 32_385, 79.6, 172, 347.8, 32),
				session("grid-shot:60s:medium", 60_000, 21_640, 82.4, 173, 345.6, 69),
				session("grid-shot:30s:large", 30_000, 11_975, 87.7, 186, 307.9, 41));
		when(repository.findByUserIdAndTrainingIdOrderByCompletedAtDesc(
				eq(userId), eq("grid-shot"), any(Pageable.class)))
				.thenReturn(new PageImpl<>(sessions));
		TrainingCareerProfileService service = new TrainingCareerProfileService(repository,
				new ObjectMapper(), CLOCK);

		TrainingCareerProfileService.ProfileView profile = service.profile(userId, "grid-shot");

		assertThat(profile.profileVersion()).isEqualTo("grid-shot-career-profile-v2");
		assertThat(profile.sample().totalSessions()).isEqualTo(4);
		assertThat(profile.sample().validSessions()).isEqualTo(4);
		assertThat(profile.sample().comparableSessions()).isEqualTo(1);
		assertThat(profile.sample().configurationCount()).isEqualTo(4);
		assertThat(profile.sample().confidence())
				.isEqualTo(TrainingCareerProfileService.ProfileConfidence.OBSERVING);
		assertThat(profile.cohort().configurationKey()).isEqualTo("grid-shot:30s:small");
		assertThat(profile.dimensions()).extracting(TrainingCareerProfileService.DimensionProfile::code)
				.containsExactly("CLICK_PRECISION", "TARGET_SWITCHING", "RHYTHM_STABILITY", "SUSTAINED_CONTROL");
		assertThat(profile.metric("accuracy").current()).isEqualTo(78.5);
		assertThat(profile.metric("accuracy").trend())
				.isEqualTo(TrainingCareerProfileService.TrendStatus.INSUFFICIENT);
		assertThatThrownBy(() -> service.loadCareerAnalysisContext(userId, "grid-shot"))
				.isInstanceOf(ApiException.class)
				.extracting(exception -> ((ApiException) exception).code())
				.isEqualTo("CAREER_COMPARABLE_SAMPLE_TOO_SMALL");
	}

	@Test
	void mostPopulatedComparableConfigurationDrivesCareerAiRegardlessOfSessionType() {
		UUID userId = UUID.randomUUID();
		TrainingSessionRepository repository = mock(TrainingSessionRepository.class);
		List<TrainingSession> sessions = List.of(
				practiceSession("grid-shot:60s:medium", 60_000, 22_400, 86, 184, 326, 78),
				practiceSession("grid-shot:60s:medium", 60_000, 22_000, 85, 181, 332, 75),
				practiceSession("grid-shot:60s:medium", 60_000, 21_600, 84, 178, 337, 71),
				practiceSession("grid-shot:60s:medium", 60_000, 21_000, 83, 174, 344, 66),
				practiceSession("grid-shot:60s:medium", 60_000, 20_700, 82, 171, 351, 62),
				practiceSession("grid-shot:60s:medium", 60_000, 20_300, 81, 168, 357, 59),
				practiceSession("grid-shot:60s:medium", 60_000, 12_500, 91, 195, 302, 90));
		when(repository.findByUserIdAndTrainingIdOrderByCompletedAtDesc(
				eq(userId), eq("grid-shot"), any(Pageable.class)))
				.thenReturn(new PageImpl<>(sessions));
		TrainingCareerProfileService service = new TrainingCareerProfileService(repository,
				new ObjectMapper(), CLOCK);

		TrainingCareerProfileService.ProfileView profile = service.profile(userId, "grid-shot");
		TrainingCareerAnalysisOperations.CareerContext context =
				service.loadCareerAnalysisContext(userId, "grid-shot");
		TrainingAnalysisSnapshot snapshot = context.snapshot();

		assertThat(profile.sample().validSessions()).isEqualTo(7);
		assertThat(profile.sample().comparableSessions()).isEqualTo(7);
		assertThat(profile.sample().configurationCount()).isEqualTo(1);
		assertThat(profile.sample().confidence())
				.isEqualTo(TrainingCareerProfileService.ProfileConfidence.DEVELOPING);
		assertThat(profile.coverage().availableDimensions()).isEqualTo(4);
		assertThat(profile.metric("accuracy").current()).isEqualTo(85d);
		assertThat(profile.metric("accuracy").lifetimeAverage()).isCloseTo(84.5714d,
				org.assertj.core.data.Offset.offset(0.0001d));
		assertThat(profile.metric("accuracy").delta()).isEqualTo(3d);
		assertThat(profile.metric("accuracy").trend())
				.isEqualTo(TrainingCareerProfileService.TrendStatus.IMPROVING);

		assertThat(context.confidence()).isEqualTo(TrainingCareerAnalysisOperations.Confidence.LOW);
		assertThat(context.sampleSize()).isEqualTo(7);
		assertThat(context.comparableSampleSize()).isEqualTo(7);
		assertThat(context.configurationCount()).isEqualTo(1);
		assertThat(snapshot.configurationKey()).isEqualTo("grid-shot:60s:medium");
		assertThat(snapshot.dataVersion()).isEqualTo(profile.dataVersion());
		assertThat(snapshot.sourceId()).contains(":cohort:grid-shot:60s:medium:1:1");
		assertThat(snapshot.summaryMetrics()).containsEntry("comparableSampleSize", 7d)
				.containsEntry("recentAccuracy", 85d);
		assertThat(snapshot.windows()).hasSize(6)
				.allSatisfy(window -> assertThat(window.metrics())
						.containsKeys("scorePerMinute", "lastPhaseAccuracy", "phaseAccuracyChange")
						.doesNotContainKey("score"));
		assertThat(snapshot.signals()).extracting(TrainingAnalysisSnapshot.Signal::code)
				.contains("ACCURACY_LIMITS_PACE")
				.doesNotContain("BENCHMARK_BASELINE");
		assertThat(snapshot.comparison()).isNotNull();
		new TrainingAnalysisPolicy().validate(snapshot);
	}

	private static TrainingSession session(String configurationKey, long durationMs, double score,
			double accuracy, double targetsPerMinute, double hitInterval, double consistency) {
		return session(configurationKey, durationMs, score, accuracy, targetsPerMinute, hitInterval,
				consistency, "grid-shot:60s:medium".equals(configurationKey) ? "benchmark" : "practice");
	}

	private static TrainingSession practiceSession(String configurationKey, long durationMs, double score,
			double accuracy, double targetsPerMinute, double hitInterval, double consistency) {
		return session(configurationKey, durationMs, score, accuracy, targetsPerMinute, hitInterval,
				consistency, "practice");
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
}
