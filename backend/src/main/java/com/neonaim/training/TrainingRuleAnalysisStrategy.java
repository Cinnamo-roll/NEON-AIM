package com.neonaim.training;

import com.neonaim.training.api.TrainingAnalysisResult;
import java.time.Instant;

interface TrainingRuleAnalysisStrategy {

	String trainingId();

	TrainingAnalysisResult analyze(TrainingRuleAnalysisContext context, Instant generatedAt);
}
