package com.neonaim.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.neonaim.common.error.ApiException;
import com.neonaim.training.api.TrainingAnalysisSnapshot;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class TrainingAiStrategyRegistryTests {

	@Test
	void secondProjectRegistersItsOwnPromptAndTargetStrategy() {
		TrainingAiAnalysisStrategy fake = new FakeAiStrategy("fake-project");
		TrainingAiAnalysisStrategyRegistry registry = new TrainingAiAnalysisStrategyRegistry(List.of(
				new GridShotTrainingAiAnalysisStrategy(), fake));

		TrainingAiAnalysisStrategy resolved = registry.require("fake-project");
		TrainingAiAnalysisStrategy.PromptSpec prompt = resolved.prompt(TrainingAnalysisSnapshot.Scope.CAREER);
		assertThat(prompt.promptVersion()).isEqualTo("fake-career-v1");
		assertThat(prompt.engineVersion()).isEqualTo("fake-engine-v1");
		assertThat(prompt.instructions()).contains("FAKE PROJECT COACH").doesNotContain("Grid Shot");
		assertThat(prompt.supportedTargetMetrics()).containsExactly("fakeMetric");
	}

	@Test
	void missingAiAndCoachingStrategiesReturnExplicitUnsupportedErrors() {
		TrainingAiAnalysisStrategyRegistry aiRegistry = new TrainingAiAnalysisStrategyRegistry(List.of(
				new GridShotTrainingAiAnalysisStrategy()));
		TrainingCoachingPolicyRegistry coachingRegistry = new TrainingCoachingPolicyRegistry(List.of(
				new GridShotTrainingCoachingPolicy()));

		assertThatThrownBy(() -> aiRegistry.require("fake-project"))
				.isInstanceOf(ApiException.class)
				.extracting(exception -> ((ApiException) exception).code())
				.isEqualTo("TRAINING_AI_UNSUPPORTED");
		assertThatThrownBy(() -> coachingRegistry.require("fake-project"))
				.isInstanceOf(ApiException.class)
				.extracting(exception -> ((ApiException) exception).code())
				.isEqualTo("TRAINING_NOT_SUPPORTED");
	}

	@Test
	void duplicateAiStrategiesFailFast() {
		assertThatThrownBy(() -> new TrainingAiAnalysisStrategyRegistry(List.of(
				new FakeAiStrategy("duplicate"), new FakeAiStrategy("duplicate"))))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("duplicate");
	}

	private record FakeAiStrategy(String trainingId) implements TrainingAiAnalysisStrategy {

		@Override
		public PromptSpec prompt(TrainingAnalysisSnapshot.Scope scope) {
			return new PromptSpec(scope == TrainingAnalysisSnapshot.Scope.CAREER
					? "fake-career-v1" : "fake-session-v1", "fake-engine-v1",
					"FAKE PROJECT COACH", Set.of("fakeMetric"));
		}

		@Override
		public void validateTarget(TrainingAnalysisProvider.Target target) {
			if (!"fakeMetric".equals(target.metric())) {
				throw new IllegalStateException("unsupported fake metric");
			}
		}
	}
}
