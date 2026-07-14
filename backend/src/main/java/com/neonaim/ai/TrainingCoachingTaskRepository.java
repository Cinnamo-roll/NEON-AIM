package com.neonaim.ai;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface TrainingCoachingTaskRepository extends JpaRepository<TrainingCoachingTask, UUID> {

	List<TrainingCoachingTask> findByUserIdAndTrainingIdAndStatus(
			UUID userId, String trainingId, TrainingCoachingTask.Status status);

	Optional<TrainingCoachingTask> findFirstByUserIdAndTrainingIdOrderByActivatedAtDesc(
			UUID userId, String trainingId);

	Optional<TrainingCoachingTask> findFirstByUserIdAndTrainingIdAndStatusOrderByActivatedAtDesc(
			UUID userId, String trainingId, TrainingCoachingTask.Status status);
}
