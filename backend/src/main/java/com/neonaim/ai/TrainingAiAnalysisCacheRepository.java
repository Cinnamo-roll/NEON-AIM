package com.neonaim.ai;

import org.springframework.data.jpa.repository.JpaRepository;

interface TrainingAiAnalysisCacheRepository extends JpaRepository<TrainingAiAnalysisCacheEntry, String> {
}
