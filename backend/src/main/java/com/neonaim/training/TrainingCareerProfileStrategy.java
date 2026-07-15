package com.neonaim.training;

import com.neonaim.training.api.TrainingCareerAnalysisOperations.CareerContext;
import java.util.UUID;

interface TrainingCareerProfileStrategy {

	String trainingId();

	Object profile(UUID userId);

	CareerContext loadCareerAnalysisContext(UUID userId);
}
