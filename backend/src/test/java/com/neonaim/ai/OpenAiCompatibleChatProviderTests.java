package com.neonaim.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

import com.neonaim.training.api.TrainingAnalysisSnapshot;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class OpenAiCompatibleChatProviderTests {

	private static TrainingAiAnalysisStrategy.PromptSpec prompt() {
		return new GridShotTrainingAiAnalysisStrategy().prompt(TrainingAnalysisSnapshot.Scope.SESSION);
	}

	@Test
	void deepSeekUsesJsonModeWithoutSendingRawEventsOrTheApiKey() throws Exception {
		CapturedCall call = execute(OpenAiCompatibleChatProvider.Profile.DEEPSEEK);

		assertThat(call.result().usage().totalTokens()).isEqualTo(410);
		assertThat(call.authorization()).isEqualTo("Bearer provider-test-key");
		assertThat(call.body()).contains("\"response_format\":{\"type\":\"json_object\"}",
				"\"thinking\":{\"type\":\"disabled\"}", "\"max_tokens\":260", "\"temperature\":0.1",
				"NEON AIM's Grid Shot coach")
				.doesNotContain("\"events\":", "provider-test-key");
		assertThat(call.testBody()).contains("\"max_tokens\":16", "{\\\"ok\\\":true}",
				"\"thinking\":{\"type\":\"disabled\"}")
				.doesNotContain("\"events\":", "provider-test-key");
	}

	@Test
	void bailianDisablesThinkingAndParsesTheStructuredResult() throws Exception {
		CapturedCall call = execute(OpenAiCompatibleChatProvider.Profile.BAILIAN);

		assertThat(call.result().headline()).isEqualTo("先稳定后段准确率");
		assertThat(call.result().findings()).hasSize(1);
		assertThat(call.body()).contains("\"enable_thinking\":false")
				.doesNotContain("\"thinking\":");
		assertThat(call.testBody()).contains("\"max_tokens\":16", "\"enable_thinking\":false");
	}

	@Test
	void truncatedResponseKeepsTheProviderTokenUsage() throws Exception {
		ObjectMapper objectMapper = new ObjectMapper();
		HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/chat/completions", exchange -> {
			String response = objectMapper.writeValueAsString(Map.of(
					"model", "deepseek-v4-flash",
					"choices", List.of(Map.of("finish_reason", "length",
							"message", Map.of("role", "assistant", "content", "{\"headline\":"))),
					"usage", Map.of("prompt_tokens", 318, "completion_tokens", 420)));
			byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
			exchange.sendResponseHeaders(200, bytes.length);
			exchange.getResponseBody().write(bytes);
			exchange.close();
		});
		server.start();
		try {
			OpenAiCompatibleChatProvider provider = new OpenAiCompatibleChatProvider(HttpClient.newHttpClient(),
					objectMapper, OpenAiCompatibleChatProvider.Profile.DEEPSEEK,
					URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/chat/completions"),
					"provider-test-key", "deepseek-v4-flash");

			ModelProviderException exception = catchThrowableOfType(ModelProviderException.class, () -> provider.analyze(
					new TrainingAnalysisProvider.AnalysisRequest(snapshot(),
							new TrainingAnalysisPolicy.TokenBudget(900, 420), prompt())));

			assertThat(exception.code()).isEqualTo("AI_RESPONSE_INCOMPLETE");
			assertThat(exception.usage()).isEqualTo(new TrainingAnalysisProvider.TokenUsage(318, 420));
		}
		finally {
			server.stop(0);
		}
	}

	@Test
	void acceptsCommonJsonModeShapeVariationsWithoutWeakeningEvidenceValidation() throws Exception {
		ObjectMapper objectMapper = new ObjectMapper();
		HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/chat/completions", exchange -> {
			String output = objectMapper.writeValueAsString(Map.of(
					"headline", "先稳定节奏",
					"summary", "节奏稳定性仍有提升空间。",
					"key_findings", List.of(Map.of(
							"code", "rhythm-instability", "severity", "improvement",
							"title", "节奏波动", "evidence", "稳定性 78 分。",
							"recommendation", "保持相邻命中的节奏。")),
					"next_action", Map.of(
							"title", "提高稳定性", "advice", "下一局优先减少节奏波动。",
							"goals", List.of(Map.of(
									"metric", "consistency_score", "label", "稳定性",
									"operator", ">=", "value", "80")))));
			String response = objectMapper.writeValueAsString(Map.of(
					"model", "deepseek-v4-flash",
					"choices", List.of(Map.of("finish_reason", "stop",
							"message", Map.of("role", "assistant", "content", "```json\n" + output + "\n```"))),
					"usage", Map.of("prompt_tokens", 693, "completion_tokens", 183)));
			byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
			exchange.sendResponseHeaders(200, bytes.length);
			exchange.getResponseBody().write(bytes);
			exchange.close();
		});
		server.start();
		try {
			OpenAiCompatibleChatProvider provider = new OpenAiCompatibleChatProvider(HttpClient.newHttpClient(),
					objectMapper, OpenAiCompatibleChatProvider.Profile.DEEPSEEK,
					URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/chat/completions"),
					"provider-test-key", "deepseek-v4-flash");

			TrainingAnalysisProvider.AnalysisResult result = provider.analyze(
					new TrainingAnalysisProvider.AnalysisRequest(snapshot(),
							new TrainingAnalysisPolicy.TokenBudget(900, 420), prompt()));

			assertThat(result.findings().getFirst().code()).isEqualTo("RHYTHM_INSTABILITY");
			assertThat(result.findings().getFirst().severity())
					.isEqualTo(TrainingAnalysisProvider.Severity.OPPORTUNITY);
			assertThat(result.nextAction().targets().getFirst())
					.extracting(TrainingAnalysisProvider.Target::metric,
							TrainingAnalysisProvider.Target::operator,
							TrainingAnalysisProvider.Target::value,
							TrainingAnalysisProvider.Target::unit)
					.containsExactly("consistencyScore", TrainingAnalysisProvider.Operator.AT_LEAST, 80d, "分");
		}
		finally {
			server.stop(0);
		}
	}

	private static CapturedCall execute(OpenAiCompatibleChatProvider.Profile profile) throws Exception {
		ObjectMapper objectMapper = new ObjectMapper();
		AtomicReference<String> requestBody = new AtomicReference<>();
		AtomicReference<String> authorization = new AtomicReference<>();
		HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/chat/completions", exchange -> {
			requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
			authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
			String output = objectMapper.writeValueAsString(Map.of(
					"headline", "先稳定后段准确率",
					"summary", "后段命中低于起步阶段。",
					"findings", List.of(Map.of(
							"code", "LATE_ACCURACY_DROP", "severity", "OPPORTUNITY",
							"title", "后段命中下降", "evidence", "第三阶段准确率 87.8%。",
							"advice", "减少后段无效点击。")),
					"nextAction", Map.of(
							"title", "守住后段准确率", "description", "下一局保持后段节奏。",
							"targets", List.of(Map.of(
									"metric", "lastPhaseAccuracy", "label", "后段准确率",
									"operator", "AT_LEAST", "value", 90, "unit", "%")))));
			String response = objectMapper.writeValueAsString(Map.of(
					"model", profile == OpenAiCompatibleChatProvider.Profile.DEEPSEEK
							? "deepseek-v4-flash" : "qwen-flash",
					"choices", List.of(Map.of(
							"finish_reason", "stop",
							"message", Map.of("role", "assistant", "content", output))),
					"usage", Map.of("prompt_tokens", 300, "completion_tokens", 110)));
			byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
			exchange.getResponseHeaders().set("Content-Type", "application/json");
			exchange.sendResponseHeaders(200, bytes.length);
			exchange.getResponseBody().write(bytes);
			exchange.close();
		});
		server.start();
		try {
			OpenAiCompatibleChatProvider provider = new OpenAiCompatibleChatProvider(HttpClient.newHttpClient(),
					objectMapper, profile,
					URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/chat/completions"),
					"provider-test-key", profile == OpenAiCompatibleChatProvider.Profile.DEEPSEEK
							? "deepseek-v4-flash" : "qwen-flash");
			TrainingAnalysisProvider.AnalysisResult result = provider.analyze(
					new TrainingAnalysisProvider.AnalysisRequest(snapshot(),
							new TrainingAnalysisPolicy.TokenBudget(900, 260), prompt()));
			String analysisBody = requestBody.get();
			TrainingAnalysisProvider.ConnectionResult connection = provider.testConnection();
			assertThat(connection.usage().totalTokens()).isEqualTo(410);
			return new CapturedCall(result, analysisBody, requestBody.get(), authorization.get());
		}
		finally {
			server.stop(0);
		}
	}

	private static TrainingAnalysisSnapshot snapshot() {
		return new TrainingAnalysisSnapshot(1, TrainingAnalysisSnapshot.Scope.SESSION, "session-id", "data-v1",
				"grid-shot", "grid-shot:60s:medium", 120,
				Map.of("accuracy", 91.3, "targetsPerMinute", 137d, "consistencyScore", 78d),
				List.of(new TrainingAnalysisSnapshot.Window("phase1", 0, 20_000, Map.of("accuracy", 94.2)),
						new TrainingAnalysisSnapshot.Window("phase2", 20_000, 40_000, Map.of("accuracy", 91.9)),
						new TrainingAnalysisSnapshot.Window("phase3", 40_000, 60_000, Map.of("accuracy", 87.8))),
				List.of(new TrainingAnalysisSnapshot.Signal("LATE_ACCURACY_DROP",
						TrainingAnalysisSnapshot.Severity.OPPORTUNITY, Map.of("accuracyDelta", -6.4))),
				null, new TrainingAnalysisSnapshot.Integrity(true, List.of()));
	}

	private record CapturedCall(TrainingAnalysisProvider.AnalysisResult result, String body, String testBody,
			String authorization) {
	}
}
