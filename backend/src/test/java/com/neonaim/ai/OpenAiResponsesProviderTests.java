package com.neonaim.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

import com.neonaim.training.api.TrainingAnalysisSnapshot;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class OpenAiResponsesProviderTests {

	private static TrainingAiAnalysisStrategy.PromptSpec prompt() {
		return new GridShotTrainingAiAnalysisStrategy().prompt(TrainingAnalysisSnapshot.Scope.SESSION);
	}

	@Test
	void sendsOnlyTheCompactSnapshotAndParsesStructuredOutput() throws Exception {
		ObjectMapper objectMapper = new ObjectMapper();
		AtomicReference<String> requestBody = new AtomicReference<>();
		AtomicReference<String> authorization = new AtomicReference<>();
		HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/v1/responses", exchange -> {
			requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
			authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
			String output = objectMapper.writeValueAsString(Map.of(
					"headline", "先稳定后段准确率",
					"summary", "后段准确率低于起步阶段。",
					"findings", List.of(Map.of(
							"code", "LATE_ACCURACY_DROP",
							"severity", "OPPORTUNITY",
							"title", "后段命中下降",
							"evidence", "第一阶段 94.2%，第三阶段 87.8%。",
							"advice", "保持速度，减少后段无效点击。")),
					"nextAction", Map.of(
							"title", "守住后段准确率",
							"description", "下一局先保持后段命中。",
							"targets", List.of(Map.of(
									"metric", "lastPhaseAccuracy",
									"label", "后段准确率",
									"operator", "AT_LEAST",
									"value", 90,
									"unit", "%")))));
			String response = objectMapper.writeValueAsString(Map.of(
					"status", "completed",
					"model", "gpt-4o-mini-2024-07-18",
					"output", List.of(Map.of("content", List.of(Map.of(
							"type", "output_text", "text", output)))),
					"usage", Map.of("input_tokens", 320, "output_tokens", 120)));
			byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
			exchange.getResponseHeaders().set("Content-Type", "application/json");
			exchange.sendResponseHeaders(200, bytes.length);
			exchange.getResponseBody().write(bytes);
			exchange.close();
		});
		server.start();
		try {
			OpenAiResponsesProvider provider = new OpenAiResponsesProvider(HttpClient.newHttpClient(), objectMapper,
					"http://127.0.0.1:" + server.getAddress().getPort() + "/v1/responses", "sk-local-test-key", "gpt-4o-mini");
			TrainingAnalysisProvider.AnalysisResult result = provider.analyze(new TrainingAnalysisProvider.AnalysisRequest(
					snapshot(), new TrainingAnalysisPolicy.TokenBudget(900, 260), prompt()));

			assertThat(result.headline()).isEqualTo("先稳定后段准确率");
			assertThat(result.findings()).hasSize(1);
			assertThat(result.usage().totalTokens()).isEqualTo(440);
			assertThat(authorization.get()).isEqualTo("Bearer sk-local-test-key");
			assertThat(requestBody.get()).contains("\"store\":false", "\"json_schema\"", "\"max_output_tokens\":260",
					"clearly evidenced strength")
					.doesNotContain("\"events\":", "sk-local-test-key");

			TrainingAnalysisProvider.ConnectionResult connection = provider.testConnection();
			assertThat(connection.model()).isEqualTo("gpt-4o-mini-2024-07-18");
			assertThat(connection.usage().totalTokens()).isEqualTo(440);
			assertThat(requestBody.get()).contains("\"connection_test\"", "\"max_output_tokens\":32", "\"store\":false")
					.doesNotContain("\"events\":", "sk-local-test-key");
		}
		finally {
			server.stop(0);
		}
	}

	@Test
	void incompleteResponseKeepsTheProviderTokenUsage() throws Exception {
		ObjectMapper objectMapper = new ObjectMapper();
		HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/v1/responses", exchange -> {
			String response = objectMapper.writeValueAsString(Map.of(
					"status", "incomplete",
					"incomplete_details", Map.of("reason", "max_output_tokens"),
					"usage", Map.of("input_tokens", 330, "output_tokens", 420)));
			byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
			exchange.sendResponseHeaders(200, bytes.length);
			exchange.getResponseBody().write(bytes);
			exchange.close();
		});
		server.start();
		try {
			OpenAiResponsesProvider provider = new OpenAiResponsesProvider(HttpClient.newHttpClient(), objectMapper,
					"http://127.0.0.1:" + server.getAddress().getPort() + "/v1/responses",
					"sk-local-test-key", "gpt-4o-mini");

			ModelProviderException exception = catchThrowableOfType(ModelProviderException.class, () -> provider.analyze(
					new TrainingAnalysisProvider.AnalysisRequest(snapshot(),
							new TrainingAnalysisPolicy.TokenBudget(900, 420), prompt())));

			assertThat(exception.code()).isEqualTo("AI_RESPONSE_INCOMPLETE");
			assertThat(exception.usage()).isEqualTo(new TrainingAnalysisProvider.TokenUsage(330, 420));
		}
		finally {
			server.stop(0);
		}
	}

	private static TrainingAnalysisSnapshot snapshot() {
		return new TrainingAnalysisSnapshot(1, TrainingAnalysisSnapshot.Scope.SESSION, "session-id", "data-v1",
				"grid-shot", "grid-shot:60s:medium", 120,
				Map.of("accuracy", 91.3, "targetsPerMinute", 137d, "consistencyScore", 78d),
				List.of(
						new TrainingAnalysisSnapshot.Window("phase1", 0, 20_000, Map.of("accuracy", 94.2)),
						new TrainingAnalysisSnapshot.Window("phase2", 20_000, 40_000, Map.of("accuracy", 91.9)),
						new TrainingAnalysisSnapshot.Window("phase3", 40_000, 60_000, Map.of("accuracy", 87.8))),
				List.of(new TrainingAnalysisSnapshot.Signal("LATE_ACCURACY_DROP",
						TrainingAnalysisSnapshot.Severity.OPPORTUNITY, Map.of("accuracyDelta", -6.4))),
				null, new TrainingAnalysisSnapshot.Integrity(true, List.of()));
	}
}
