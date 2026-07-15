package com.neonaim.training;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.neonaim.common.error.ApiException;
import com.neonaim.training.api.TrainingAnalysisSnapshot;
import com.neonaim.training.api.TrainingCareerAnalysisOperations.CareerContext;
import com.neonaim.training.api.TrainingCareerAnalysisOperations.Confidence;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class TrainingProjectRegistryTests {

	@Test
	void secondProjectCanRegisterProfileAndValidationStrategies() {
		UUID userId = UUID.randomUUID();
		TrainingCareerProfileRegistry profileRegistry = new TrainingCareerProfileRegistry(
				List.of(new FakeProfileStrategy("fake-project")));
		AtomicBoolean validated = new AtomicBoolean();
		TrainingSessionValidator validator = new FakeSessionValidator("fake-project", validated);
		TrainingSessionValidationEngine validationEngine = new TrainingSessionValidationEngine(List.of(validator));
		TrainingSessionSubmission submission = submission("fake-project");

		assertThat(profileRegistry.profile(userId, "fake-project")).isEqualTo(Map.of("trainingId", "fake-project"));
		assertThat(profileRegistry.loadCareerAnalysisContext(userId, "fake-project").snapshot().trainingId())
				.isEqualTo("fake-project");
		validationEngine.validate(submission);
		assertThat(validated).isTrue();
		assertThat(validationEngine.coachingMetrics(submission)).containsEntry("fakeMetric", 42d);
	}

	@Test
	void unknownTrainingIsRejectedInsteadOfFallingBackToGridShot() {
		TrainingCareerProfileRegistry profileRegistry = new TrainingCareerProfileRegistry(
				List.of(new FakeProfileStrategy("fake-project")));
		TrainingSessionValidationEngine validationEngine = new TrainingSessionValidationEngine(
				List.of(new FakeSessionValidator("fake-project", new AtomicBoolean())));

		assertThatThrownBy(() -> profileRegistry.profile(UUID.randomUUID(), "unknown-project"))
				.isInstanceOf(ApiException.class)
				.extracting(exception -> ((ApiException) exception).code())
				.isEqualTo("TRAINING_UNSUPPORTED");
		assertThatThrownBy(() -> validationEngine.validate(submission("unknown-project")))
				.isInstanceOf(ApiException.class)
				.extracting(exception -> ((ApiException) exception).code())
				.isEqualTo("TRAINING_UNSUPPORTED");
	}

	@Test
	void duplicateProjectStrategiesFailFast() {
		assertThatThrownBy(() -> new TrainingCareerProfileRegistry(List.of(
				new FakeProfileStrategy("duplicate"), new FakeProfileStrategy("duplicate"))))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("duplicate");
	}

	private static TrainingSessionSubmission submission(String trainingId) {
		ObjectMapper objectMapper = new ObjectMapper();
		return new TrainingSessionSubmission("fake-session", trainingId, 1, 1,
				trainingId + ":practice", "practice", Instant.parse("2026-07-15T00:00:00Z"),
				Instant.parse("2026-07-15T00:00:30Z"), 30_000,
				objectMapper.createObjectNode(),
				new TrainingSessionSubmission.Summary(42, 1, 0, 100, 2, 500, 80, 1, "A"),
				objectMapper.createObjectNode(), objectMapper.createObjectNode(),
				new TrainingSessionSubmission.Integrity(true, List.of()));
	}

	private record FakeProfileStrategy(String trainingId) implements TrainingCareerProfileStrategy {

		@Override
		public Object profile(UUID userId) {
			return Map.of("trainingId", trainingId);
		}

		@Override
		public CareerContext loadCareerAnalysisContext(UUID userId) {
			TrainingAnalysisSnapshot snapshot = new TrainingAnalysisSnapshot(1,
					TrainingAnalysisSnapshot.Scope.CAREER, "career:" + trainingId, "data-v1",
					trainingId, trainingId + ":benchmark", 1, Map.of("fakeMetric", 42d),
					List.of(), List.of(), null, new TrainingAnalysisSnapshot.Integrity(true, List.of()));
			return new CareerContext(UUID.randomUUID(), snapshot, Confidence.INITIAL, 1, 1, 1);
		}
	}

	private record FakeSessionValidator(String trainingId, AtomicBoolean validated)
			implements TrainingSessionValidator {

		@Override
		public void validate(TrainingSessionSubmission submission) {
			validated.set(true);
		}

		@Override
		public Map<String, Double> coachingMetrics(TrainingSessionSubmission submission) {
			return Map.of("fakeMetric", 42d);
		}
	}
}
