package com.neonaim.ai;

import java.util.Set;
import org.springframework.stereotype.Component;

@Component
class GridShotTrainingCoachingPolicy implements TrainingCoachingPolicy {

	private static final Set<String> SUPPORTED_METRICS = Set.of(
			"accuracy", "consistencyScore", "targetsPerMinute", "averageHitInterval",
			"lastPhaseAccuracy", "maxCombo");

	@Override
	public String trainingId() {
		return "grid-shot";
	}

	@Override
	public String configurationKey() {
		return "grid-shot:60s:medium";
	}

	@Override
	public int modeVersion() {
		return 1;
	}

	@Override
	public int scoringVersion() {
		return 1;
	}

	@Override
	public Set<String> supportedMetrics() {
		return SUPPORTED_METRICS;
	}
}
