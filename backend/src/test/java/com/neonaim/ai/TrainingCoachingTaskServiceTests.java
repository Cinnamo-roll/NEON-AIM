package com.neonaim.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.neonaim.training.api.TrainingAnalysisResult;
import com.neonaim.training.api.TrainingCoachingTaskOperations;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class TrainingCoachingTaskServiceTests {

	private static final Instant ACTIVATED_AT = Instant.parse("2026-07-14T10:00:00Z");

	@Test
	void freePracticeDoesNotConsumeTaskAndTwoPassingBenchmarksCompleteTheCycle() throws Exception {
		UUID userId = UUID.randomUUID();
		TrainingCoachingTaskRepository taskRepository = mock(TrainingCoachingTaskRepository.class);
		TrainingCareerAiAnalysisCallRepository analysisRepository = mock(TrainingCareerAiAnalysisCallRepository.class);
		ObjectMapper objectMapper = new ObjectMapper();
		TrainingCareerAiAnalysisCall analysisCall = readyBenchmarkCall(userId, objectMapper);
		when(analysisRepository.findByIdAndUserId(analysisCall.id(), userId)).thenReturn(Optional.of(analysisCall));
		when(taskRepository.findByUserIdAndTrainingIdAndStatus(
				userId, "grid-shot", TrainingCoachingTask.Status.ACTIVE)).thenReturn(List.of());
		when(taskRepository.save(any(TrainingCoachingTask.class))).thenAnswer(invocation -> invocation.getArgument(0));

		TrainingCoachingTaskService service = new TrainingCoachingTaskService(taskRepository,
				analysisRepository, objectMapper, Clock.fixed(ACTIVATED_AT, ZoneOffset.UTC));
		TrainingCoachingTaskService.TaskView adopted = service.adopt(userId, "grid-shot", analysisCall.id());
		TrainingCoachingTask task = new TrainingCoachingTask(userId, "grid-shot", analysisCall.id(),
				"data-v1", "grid-shot:60s:medium", 1, 1, adopted.title(), adopted.description(),
				objectMapper.writeValueAsString(adopted.targets()), ACTIVATED_AT);
		when(taskRepository.findFirstByUserIdAndTrainingIdAndStatusOrderByActivatedAtDesc(
				userId, "grid-shot", TrainingCoachingTask.Status.ACTIVE)).thenReturn(Optional.of(task));

		service.evaluateCompletedSession(session(userId, "grid-shot:30s:small",
				Map.of("accuracy", 99d, "consistencyScore", 99d)));
		assertThat(task.status()).isEqualTo(TrainingCoachingTask.Status.ACTIVE);

		TrainingCoachingTaskOperations.CompletedSession firstBenchmark = session(userId,
				"grid-shot:60s:medium", Map.of("accuracy", 91d, "consistencyScore", 72d));
		service.evaluateCompletedSession(firstBenchmark);
		service.evaluateCompletedSession(firstBenchmark);
		assertThat(task.status()).isEqualTo(TrainingCoachingTask.Status.ACTIVE);
		TrainingCoachingTaskService.TaskView afterFirst = service.latest(userId, "grid-shot");
		assertThat(afterFirst.progress().attemptsCompleted()).isEqualTo(1);
		assertThat(afterFirst.progress().remainingAttempts()).isEqualTo(2);
		assertThat(afterFirst.progress().targets()).allSatisfy(target -> {
			assertThat(target.passCount()).isEqualTo(1);
			assertThat(target.requiredPasses()).isEqualTo(2);
			assertThat(target.achieved()).isFalse();
		});

		service.evaluateCompletedSession(session(userId, "grid-shot:60s:medium",
				Map.of("accuracy", 92d, "consistencyScore", 74d)));
		assertThat(task.status()).isEqualTo(TrainingCoachingTask.Status.COMPLETED);
		assertThat(task.evaluationStatus()).isEqualTo(TrainingCoachingTask.EvaluationStatus.ACHIEVED);
		assertThat(task.evaluatedSessionId()).isNotNull();
		assertThat(task.evaluationJson()).contains("actualValue\":92.0", "actualValue\":74.0");
		TrainingCoachingTaskService.TaskView completed = service.latest(userId, "grid-shot");
		assertThat(completed.progress().attemptsCompleted()).isEqualTo(2);
		assertThat(completed.progress().remainingAttempts()).isZero();
		assertThat(completed.progress().targets()).allMatch(TrainingCoachingTaskService.TargetProgress::achieved);
	}

	@Test
	void threeAttemptsProduceAPartialCycleWhenOnlyOneTargetIsRepeatedlyMet() throws Exception {
		UUID userId = UUID.randomUUID();
		TrainingCoachingTaskRepository taskRepository = mock(TrainingCoachingTaskRepository.class);
		ObjectMapper objectMapper = new ObjectMapper();
		TrainingCoachingTask task = new TrainingCoachingTask(userId, "grid-shot", UUID.randomUUID(),
				"data-v1", "grid-shot:60s:medium", 1, 1, "Hold the line", "Keep both targets",
				objectMapper.writeValueAsString(targets()), ACTIVATED_AT);
		when(taskRepository.findFirstByUserIdAndTrainingIdAndStatusOrderByActivatedAtDesc(
				userId, "grid-shot", TrainingCoachingTask.Status.ACTIVE)).thenReturn(Optional.of(task));
		TrainingCoachingTaskService service = new TrainingCoachingTaskService(taskRepository,
				mock(TrainingCareerAiAnalysisCallRepository.class), objectMapper,
				Clock.fixed(ACTIVATED_AT, ZoneOffset.UTC));

		service.evaluateCompletedSession(session(userId, "grid-shot:60s:medium",
				Map.of("accuracy", 91d, "consistencyScore", 60d)));
		service.evaluateCompletedSession(session(userId, "grid-shot:60s:medium",
				Map.of("accuracy", 92d, "consistencyScore", 62d)));
		assertThat(task.status()).isEqualTo(TrainingCoachingTask.Status.ACTIVE);
		service.evaluateCompletedSession(session(userId, "grid-shot:60s:medium",
				Map.of("accuracy", 88d, "consistencyScore", 65d)));

		assertThat(task.status()).isEqualTo(TrainingCoachingTask.Status.COMPLETED);
		assertThat(task.evaluationStatus()).isEqualTo(TrainingCoachingTask.EvaluationStatus.PARTIAL);
		TrainingCoachingTaskService.TaskView completed = service.latest(userId, "grid-shot");
		assertThat(completed.progress().attemptsCompleted()).isEqualTo(3);
		assertThat(completed.progress().targets())
				.extracting(TrainingCoachingTaskService.TargetProgress::passCount)
				.containsExactly(2, 0);
		assertThat(completed.evaluation().targets())
				.extracting(TrainingCoachingTaskService.TargetEvaluation::passed)
				.containsExactly(true, false);
	}

	@Test
	void threeFailedAttemptsCloseTheCycleWithoutAchievement() throws Exception {
		UUID userId = UUID.randomUUID();
		TrainingCoachingTaskRepository taskRepository = mock(TrainingCoachingTaskRepository.class);
		ObjectMapper objectMapper = new ObjectMapper();
		TrainingCoachingTask task = new TrainingCoachingTask(userId, "grid-shot", UUID.randomUUID(),
				"data-v1", "grid-shot:60s:medium", 1, 1, "Hold the line", "Keep both targets",
				objectMapper.writeValueAsString(targets()), ACTIVATED_AT);
		when(taskRepository.findFirstByUserIdAndTrainingIdAndStatusOrderByActivatedAtDesc(
				userId, "grid-shot", TrainingCoachingTask.Status.ACTIVE)).thenReturn(Optional.of(task));
		TrainingCoachingTaskService service = new TrainingCoachingTaskService(taskRepository,
				mock(TrainingCareerAiAnalysisCallRepository.class), objectMapper,
				Clock.fixed(ACTIVATED_AT, ZoneOffset.UTC));

		for (int attempt = 0; attempt < 3; attempt++) {
			service.evaluateCompletedSession(session(userId, "grid-shot:60s:medium",
					Map.of("accuracy", 85d, "consistencyScore", 60d)));
		}

		assertThat(task.status()).isEqualTo(TrainingCoachingTask.Status.COMPLETED);
		assertThat(task.evaluationStatus()).isEqualTo(TrainingCoachingTask.EvaluationStatus.NOT_ACHIEVED);
	}

	@Test
	void aSessionThatStartedBeforeAdoptionCannotCompleteTheTask() throws Exception {
		UUID userId = UUID.randomUUID();
		TrainingCoachingTaskRepository taskRepository = mock(TrainingCoachingTaskRepository.class);
		TrainingCoachingTask task = new TrainingCoachingTask(userId, "grid-shot", UUID.randomUUID(),
				"data-v1", "grid-shot:60s:medium", 1, 1, "Hold the line", "Keep both targets",
				new ObjectMapper().writeValueAsString(targets()), ACTIVATED_AT);
		when(taskRepository.findFirstByUserIdAndTrainingIdAndStatusOrderByActivatedAtDesc(
				userId, "grid-shot", TrainingCoachingTask.Status.ACTIVE)).thenReturn(Optional.of(task));
		TrainingCoachingTaskService service = new TrainingCoachingTaskService(taskRepository,
				mock(TrainingCareerAiAnalysisCallRepository.class), new ObjectMapper(),
				Clock.fixed(ACTIVATED_AT, ZoneOffset.UTC));
		TrainingCoachingTaskOperations.CompletedSession session = new TrainingCoachingTaskOperations.CompletedSession(
				userId, UUID.randomUUID(), "grid-shot", 1, 1, "grid-shot:60s:medium",
				ACTIVATED_AT.minusSeconds(1), ACTIVATED_AT.plusSeconds(59), true,
				Map.of("accuracy", 95d, "consistencyScore", 80d));

		service.evaluateCompletedSession(session);

		assertThat(task.status()).isEqualTo(TrainingCoachingTask.Status.ACTIVE);
	}

	private static TrainingCareerAiAnalysisCall readyBenchmarkCall(UUID userId,
			ObjectMapper objectMapper) throws Exception {
		TrainingCareerAiAnalysisCall call = new TrainingCareerAiAnalysisCall(userId, UUID.randomUUID(),
				"grid-shot", "career:" + userId + ":grid-shot:benchmark", "data-v1",
				"deepseek", "deepseek-chat", "career-v2", "INITIAL", 4, 4, 1,
				ACTIVATED_AT.minusSeconds(10));
		call.complete(new TrainingAnalysisProvider.TokenUsage(100, 50), false,
				objectMapper.writeValueAsString(analysis()), ACTIVATED_AT.minusSeconds(5));
		return call;
	}

	private static TrainingAnalysisResult analysis() {
		return new TrainingAnalysisResult(1, TrainingAnalysisResult.Status.READY,
				TrainingAnalysisResult.Source.AI, "career-ai-v2", "deepseek", "deepseek-chat",
				"career-v2", "Accuracy before pace", "Keep the run controlled.", List.of(),
				new TrainingAnalysisResult.NextAction("Hold the line", "Keep both targets", targets()),
				new TrainingAnalysisResult.TokenUsage(100, 50), ACTIVATED_AT.minusSeconds(5));
	}

	private static List<TrainingAnalysisResult.Target> targets() {
		return List.of(
				new TrainingAnalysisResult.Target("accuracy", "Accuracy",
						TrainingAnalysisResult.Operator.AT_LEAST, 90, "%"),
				new TrainingAnalysisResult.Target("consistencyScore", "Stability",
						TrainingAnalysisResult.Operator.AT_LEAST, 70, "score"));
	}

	private static TrainingCoachingTaskOperations.CompletedSession session(UUID userId,
			String configurationKey, Map<String, Double> metrics) {
		return new TrainingCoachingTaskOperations.CompletedSession(userId, UUID.randomUUID(),
				"grid-shot", 1, 1, configurationKey, ACTIVATED_AT.plusSeconds(1),
				ACTIVATED_AT.plusSeconds(61), true, metrics);
	}
}
