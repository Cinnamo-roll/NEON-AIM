package com.neonaim.ai;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface TrainingCareerAiAnalysisCallRepository extends JpaRepository<TrainingCareerAiAnalysisCall, UUID> {

	Optional<TrainingCareerAiAnalysisCall> findByIdAndUserId(UUID id, UUID userId);

	Optional<TrainingCareerAiAnalysisCall> findFirstByUserIdAndTrainingIdOrderByCreatedAtDesc(
			UUID userId, String trainingId);

	Optional<TrainingCareerAiAnalysisCall> findFirstByUserIdAndTrainingIdAndStatusOrderByCreatedAtDesc(
			UUID userId, String trainingId, TrainingCareerAiAnalysisCall.Status status);
}
