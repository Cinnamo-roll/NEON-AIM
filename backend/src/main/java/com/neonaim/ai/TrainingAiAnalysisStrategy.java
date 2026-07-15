package com.neonaim.ai;

import com.neonaim.training.api.TrainingAnalysisSnapshot;
import java.util.Objects;
import java.util.Set;

public interface TrainingAiAnalysisStrategy {

	String trainingId();

	PromptSpec prompt(TrainingAnalysisSnapshot.Scope scope);

	void validateTarget(TrainingAnalysisProvider.Target target);

	record PromptSpec(String promptVersion, String engineVersion, String instructions,
			Set<String> supportedTargetMetrics) {

		public PromptSpec {
			if (promptVersion == null || promptVersion.isBlank()
					|| engineVersion == null || engineVersion.isBlank()
					|| instructions == null || instructions.isBlank()) {
				throw new IllegalArgumentException("AI prompt strategy fields must not be blank");
			}
			supportedTargetMetrics = Set.copyOf(Objects.requireNonNull(
					supportedTargetMetrics, "supportedTargetMetrics"));
			if (supportedTargetMetrics.isEmpty()) {
				throw new IllegalArgumentException("AI prompt strategy must support at least one target metric");
			}
		}
	}
}
