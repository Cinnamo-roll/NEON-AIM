package com.neonaim.training;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface TrainingSessionRepository extends JpaRepository<TrainingSession, UUID> {

	Optional<TrainingSession> findByUserIdAndClientSessionId(UUID userId, String clientSessionId);

	Optional<TrainingSession> findByIdAndUserId(UUID id, UUID userId);

	boolean existsByIdAndUserId(UUID id, UUID userId);

	@Query(value = """
			select new com.neonaim.training.TrainingSessionSummaryView(
				s.id, s.clientSessionId, s.trainingId, s.modeVersion, s.scoringVersion,
				s.configurationKey, s.sessionType, s.startedAt, s.completedAt, s.durationMs,
				s.score, s.hits, s.misses, s.accuracy, s.targetsPerMinute,
				s.averageHitInterval, s.consistencyScore, s.maxCombo, s.grade,
				s.integrityStatus, s.analysisDataVersion)
			from TrainingSession s
			where s.userId = :userId
			order by s.completedAt desc
			""", countQuery = "select count(s) from TrainingSession s where s.userId = :userId")
	Page<TrainingSessionSummaryView> findSummariesByUserId(@Param("userId") UUID userId, Pageable pageable);

	@Query(value = """
			select new com.neonaim.training.TrainingSessionSummaryView(
				s.id, s.clientSessionId, s.trainingId, s.modeVersion, s.scoringVersion,
				s.configurationKey, s.sessionType, s.startedAt, s.completedAt, s.durationMs,
				s.score, s.hits, s.misses, s.accuracy, s.targetsPerMinute,
				s.averageHitInterval, s.consistencyScore, s.maxCombo, s.grade,
				s.integrityStatus, s.analysisDataVersion)
			from TrainingSession s
			where s.userId = :userId and s.trainingId = :trainingId
			order by s.completedAt desc
			""", countQuery = """
			select count(s) from TrainingSession s
			where s.userId = :userId and s.trainingId = :trainingId
			""")
	Page<TrainingSessionSummaryView> findSummariesByUserIdAndTrainingId(
			@Param("userId") UUID userId, @Param("trainingId") String trainingId, Pageable pageable);

	@Query(value = """
			select new com.neonaim.training.TrainingCareerSessionView(
				s.id, s.configurationKey, s.sessionType, s.modeVersion, s.scoringVersion, s.completedAt,
				s.score, s.durationMs, s.accuracy, s.targetsPerMinute, s.averageHitInterval,
				s.consistencyScore, s.maxCombo, s.integrityStatus,
				s.analysisSnapshotJson, s.analysisDataVersion)
			from TrainingSession s
			where s.userId = :userId and s.trainingId = :trainingId
			order by s.completedAt desc
			""", countQuery = """
			select count(s) from TrainingSession s
			where s.userId = :userId and s.trainingId = :trainingId
			""")
	Page<TrainingCareerSessionView> findCareerSessionsByUserIdAndTrainingId(
			@Param("userId") UUID userId, @Param("trainingId") String trainingId, Pageable pageable);

	@Query("""
			select new com.neonaim.training.TrainingCareerCohortAggregateView(
				s.configurationKey, s.modeVersion, s.scoringVersion, s.sessionType,
				count(s), sum(s.durationMs),
				avg(s.score * 60000.0 / s.durationMs), max(s.score * 60000.0 / s.durationMs),
				avg(s.accuracy), avg(s.targetsPerMinute), avg(s.averageHitInterval),
				avg(s.consistencyScore), avg(s.maxCombo))
			from TrainingSession s
			where s.userId = :userId and s.trainingId = :trainingId and s.integrityStatus = :integrityStatus
			group by s.configurationKey, s.modeVersion, s.scoringVersion, s.sessionType
			""")
	List<TrainingCareerCohortAggregateView> findCareerCohortAggregates(
			@Param("userId") UUID userId, @Param("trainingId") String trainingId,
			@Param("integrityStatus") TrainingSession.IntegrityStatus integrityStatus);

	@Query("""
			select new com.neonaim.training.TrainingCareerSessionView(
				s.id, s.configurationKey, s.sessionType, s.modeVersion, s.scoringVersion, s.completedAt,
				s.score, s.durationMs, s.accuracy, s.targetsPerMinute, s.averageHitInterval,
				s.consistencyScore, s.maxCombo, s.integrityStatus,
				s.analysisSnapshotJson, s.analysisDataVersion)
			from TrainingSession s
			where s.userId = :userId and s.trainingId = :trainingId and s.integrityStatus = :integrityStatus
			order by s.completedAt desc
			""")
	List<TrainingCareerSessionView> findRecentValidCareerSessions(
			@Param("userId") UUID userId, @Param("trainingId") String trainingId,
			@Param("integrityStatus") TrainingSession.IntegrityStatus integrityStatus, Pageable pageable);

	@Query("""
			select new com.neonaim.training.TrainingCareerSessionView(
				s.id, s.configurationKey, s.sessionType, s.modeVersion, s.scoringVersion, s.completedAt,
				s.score, s.durationMs, s.accuracy, s.targetsPerMinute, s.averageHitInterval,
				s.consistencyScore, s.maxCombo, s.integrityStatus,
				s.analysisSnapshotJson, s.analysisDataVersion)
			from TrainingSession s
			where s.userId = :userId and s.trainingId = :trainingId
				and s.configurationKey = :configurationKey and s.modeVersion = :modeVersion
				and s.scoringVersion = :scoringVersion and s.integrityStatus = :integrityStatus
			order by s.completedAt desc
			""")
	List<TrainingCareerSessionView> findRecentValidCareerSessionsForCohort(
			@Param("userId") UUID userId, @Param("trainingId") String trainingId,
			@Param("configurationKey") String configurationKey, @Param("modeVersion") int modeVersion,
			@Param("scoringVersion") int scoringVersion,
			@Param("integrityStatus") TrainingSession.IntegrityStatus integrityStatus, Pageable pageable);

	Page<TrainingSession> findByUserIdAndTrainingIdAndConfigurationKeyAndModeVersionAndScoringVersionAndIntegrityStatusAndCompletedAtLessThanEqualOrderByCompletedAtDesc(
			UUID userId, String trainingId, String configurationKey, int modeVersion, int scoringVersion,
			TrainingSession.IntegrityStatus integrityStatus, Instant completedAt, Pageable pageable);
}
