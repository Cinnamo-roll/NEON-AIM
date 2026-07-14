package com.neonaim.training;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

interface TrainingSessionRepository extends JpaRepository<TrainingSession, UUID> {

	Optional<TrainingSession> findByUserIdAndClientSessionId(UUID userId, String clientSessionId);

	Optional<TrainingSession> findByIdAndUserId(UUID id, UUID userId);

	boolean existsByIdAndUserId(UUID id, UUID userId);

	Page<TrainingSession> findByUserIdOrderByCompletedAtDesc(UUID userId, Pageable pageable);

	Page<TrainingSession> findByUserIdAndTrainingIdOrderByCompletedAtDesc(UUID userId, String trainingId,
			Pageable pageable);

	Page<TrainingSession> findByUserIdAndTrainingIdAndConfigurationKeyAndModeVersionAndScoringVersionAndIntegrityStatusAndCompletedAtLessThanEqualOrderByCompletedAtDesc(
			UUID userId, String trainingId, String configurationKey, int modeVersion, int scoringVersion,
			TrainingSession.IntegrityStatus integrityStatus, Instant completedAt, Pageable pageable);
}
