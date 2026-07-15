package com.neonaim.ai;

import java.util.Set;

interface TrainingCoachingPolicy {

	String trainingId();

	String configurationKey();

	int modeVersion();

	int scoringVersion();

	Set<String> supportedMetrics();

	default boolean supportsAnalysisSource(TrainingCareerAiAnalysisCall call) {
		return call.sourceId().endsWith(":benchmark") && call.configurationCount() == 1;
	}
}
