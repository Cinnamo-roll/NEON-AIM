package com.neonaim.ai;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface TrainingAiAnalysisCallRepository extends JpaRepository<TrainingAiAnalysisCall, UUID> {

	Optional<TrainingAiAnalysisCall> findFirstByUserIdAndSessionIdOrderByCreatedAtDesc(UUID userId, UUID sessionId);

	Optional<TrainingAiAnalysisCall> findFirstByUserIdAndSessionIdAndStatusOrderByCreatedAtDesc(
			UUID userId, UUID sessionId, TrainingAiAnalysisCall.Status status);
}
