package com.neonaim.training;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface TrainingSessionAnalysisRepository extends JpaRepository<TrainingSessionAnalysis, UUID> {
}
