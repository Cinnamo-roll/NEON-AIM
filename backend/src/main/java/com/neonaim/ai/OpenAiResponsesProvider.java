package com.neonaim.ai;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

final class OpenAiResponsesProvider implements TrainingAnalysisProvider {

	private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(30);
	private final HttpClient httpClient;
	private final ObjectMapper objectMapper;
	private final URI endpoint;
	private final String apiKey;
	private final String model;

	OpenAiResponsesProvider(HttpClient httpClient, ObjectMapper objectMapper, String endpoint,
			String apiKey, String model) {
		this.httpClient = Objects.requireNonNull(httpClient, "httpClient");
		this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
		this.endpoint = URI.create(Objects.requireNonNull(endpoint, "endpoint"));
		this.apiKey = requireText(apiKey, "apiKey", 512);
		this.model = requireText(model, "model", 80);
	}

	@Override
	public AnalysisResult analyze(AnalysisRequest request) {
		String body = requestBody(request);
		HttpRequest httpRequest = HttpRequest.newBuilder(endpoint)
				.timeout(REQUEST_TIMEOUT)
				.header("Authorization", "Bearer " + apiKey)
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(body))
				.build();
		HttpResponse<String> response = send(httpRequest);
		if (response.statusCode() < 200 || response.statusCode() >= 300) {
			throw providerError(response.statusCode(), response.body());
		}
		return parseResponse(response.body());
	}

	@Override
	public ConnectionResult testConnection() {
		HttpRequest request = HttpRequest.newBuilder(endpoint)
				.timeout(REQUEST_TIMEOUT)
				.header("Authorization", "Bearer " + apiKey)
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(connectionTestBody()))
				.build();
		HttpResponse<String> response = send(request);
		if (response.statusCode() < 200 || response.statusCode() >= 300) {
			throw providerError(response.statusCode(), response.body());
		}
		try {
			JsonNode root = objectMapper.readTree(response.body());
			if (!"completed".equals(root.path("status").asString())) {
				throw new ModelProviderException("AI_CONNECTION_TEST_FAILED", "模型未能完成测试请求");
			}
			JsonNode usage = root.path("usage");
			return new ConnectionResult(root.path("model").asString(model),
					new TokenUsage(usage.path("input_tokens").asInt(0), usage.path("output_tokens").asInt(0)));
		}
		catch (ModelProviderException exception) {
			throw exception;
		}
		catch (JacksonException exception) {
			throw new ModelProviderException("AI_RESPONSE_INVALID", "模型测试返回无效", exception);
		}
	}

	@Override
	public String providerId() {
		return "openai-responses:" + model;
	}

	private String requestBody(AnalysisRequest analysisRequest) {
		try {
			Map<String, Object> request = new LinkedHashMap<>();
			request.put("model", model);
			request.put("instructions", analysisRequest.prompt().instructions());
			request.put("input", objectMapper.writeValueAsString(analysisRequest.snapshot()));
			request.put("max_output_tokens", analysisRequest.budget().maxOutputTokens());
			request.put("store", false);
			request.put("text", Map.of("format", responseFormat(
					analysisRequest.prompt().supportedTargetMetrics())));
			return objectMapper.writeValueAsString(request);
		}
		catch (JacksonException exception) {
			throw new ModelProviderException("AI_REQUEST_INVALID", "AI 分析请求无法序列化", exception);
		}
	}

	private String connectionTestBody() {
		try {
			Map<String, Object> schema = objectSchema(Map.of("ok", Map.of("type", "boolean")), List.of("ok"));
			Map<String, Object> request = new LinkedHashMap<>();
			request.put("model", model);
			request.put("input", "Return JSON with ok set to true.");
			request.put("max_output_tokens", 32);
			request.put("store", false);
			request.put("text", Map.of("format", Map.of(
					"type", "json_schema", "name", "connection_test", "strict", true, "schema", schema)));
			return objectMapper.writeValueAsString(request);
		}
		catch (JacksonException exception) {
			throw new ModelProviderException("AI_REQUEST_INVALID", "模型测试请求无法序列化", exception);
		}
	}

	private HttpResponse<String> send(HttpRequest request) {
		try {
			return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
		}
		catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			throw new ModelProviderException("AI_REQUEST_INTERRUPTED", "AI 请求已中断", exception);
		}
		catch (IOException exception) {
			throw new ModelProviderException("AI_PROVIDER_UNAVAILABLE", "AI 服务暂时无法连接", exception);
		}
	}

	private AnalysisResult parseResponse(String body) {
		TokenUsage usage = new TokenUsage(0, 0);
		try {
			JsonNode root = objectMapper.readTree(body);
			JsonNode usageNode = root.path("usage");
			usage = new TokenUsage(usageNode.path("input_tokens").asInt(0),
					usageNode.path("output_tokens").asInt(0));
			if (!"completed".equals(root.path("status").asString())) {
				String reason = root.path("incomplete_details").path("reason").asString("unknown");
				throw new ModelProviderException("AI_RESPONSE_INCOMPLETE", "AI 返回未完成：" + reason, null, usage);
			}
			String outputText = root.path("output_text").asString("");
			if (outputText.isBlank()) {
				outputText = findOutputText(root.path("output"));
			}
			if (outputText.isBlank()) {
				throw new ModelProviderException("AI_RESPONSE_EMPTY", "AI 没有返回可用分析", null, usage);
			}
			ProviderOutput output = objectMapper.readValue(outputText, ProviderOutput.class);
			return new AnalysisResult(output.headline(), output.summary(),
					output.findings().stream().map(FindingOutput::toProvider).toList(),
					output.nextAction().toProvider(),
					root.path("model").asString(model),
					usage);
		}
		catch (ModelProviderException exception) {
			throw exception;
		}
		catch (JacksonException | IllegalArgumentException exception) {
			throw new ModelProviderException("AI_RESPONSE_INVALID", "AI 返回的结构化分析无效", exception, usage);
		}
	}

	private static String findOutputText(JsonNode output) {
		if (!output.isArray()) return "";
		for (JsonNode item : output) {
			JsonNode content = item.path("content");
			if (!content.isArray()) continue;
			for (JsonNode part : content) {
				if ("output_text".equals(part.path("type").asString())) {
					String text = part.path("text").asString("");
					if (!text.isBlank()) return text;
				}
			}
		}
		return "";
	}

	private ModelProviderException providerError(int status, String body) {
		String providerCode = "HTTP_" + status;
		String providerMessage = "AI 服务请求失败";
		try {
			JsonNode error = objectMapper.readTree(body).path("error");
			providerCode = error.path("code").asString(providerCode);
			providerMessage = error.path("message").asString(providerMessage);
		}
		catch (JacksonException ignored) {
			// The status code remains sufficient and the response body is never logged.
		}
		String code = status == 401 ? "AI_API_KEY_INVALID"
				: status == 429 ? "AI_RATE_LIMITED" : "AI_PROVIDER_" + sanitizeCode(providerCode);
		return new ModelProviderException(code, truncate(providerMessage, 300));
	}

	private static Map<String, Object> responseFormat(java.util.Set<String> supportedTargetMetrics) {
		Map<String, Object> finding = objectSchema(Map.of(
				"code", stringSchema(),
				"severity", enumSchema("POSITIVE", "OPPORTUNITY", "WARNING"),
				"title", stringSchema(),
				"evidence", stringSchema(),
				"advice", stringSchema()),
				List.of("code", "severity", "title", "evidence", "advice"));
		Map<String, Object> target = objectSchema(Map.of(
				"metric", Map.of("type", "string", "enum", supportedTargetMetrics.stream().sorted().toList()),
				"label", stringSchema(),
				"operator", enumSchema("AT_LEAST", "AT_MOST"),
				"value", Map.of("type", "number"),
				"unit", stringSchema()),
				List.of("metric", "label", "operator", "value", "unit"));
		Map<String, Object> nextAction = objectSchema(Map.of(
				"title", stringSchema(),
				"description", stringSchema(),
				"targets", Map.of("type", "array", "items", target, "minItems", 1, "maxItems", 3)),
				List.of("title", "description", "targets"));
		Map<String, Object> schema = objectSchema(Map.of(
				"headline", stringSchema(),
				"summary", stringSchema(),
				"findings", Map.of("type", "array", "items", finding, "minItems", 1, "maxItems", 3),
				"nextAction", nextAction),
				List.of("headline", "summary", "findings", "nextAction"));
		return Map.of("type", "json_schema", "name", "training_analysis", "strict", true, "schema", schema);
	}

	private static Map<String, Object> objectSchema(Map<String, Object> properties, List<String> required) {
		return Map.of("type", "object", "properties", properties, "required", required,
				"additionalProperties", false);
	}

	private static Map<String, Object> stringSchema() {
		return Map.of("type", "string");
	}

	private static Map<String, Object> enumSchema(String... values) {
		return Map.of("type", "string", "enum", List.of(values));
	}

	private static String requireText(String value, String field, int maximumLength) {
		if (value == null || value.isBlank() || value.length() > maximumLength) {
			throw new IllegalArgumentException(field + " is blank or too long");
		}
		return value;
	}

	private static String sanitizeCode(String value) {
		String sanitized = value.toUpperCase().replaceAll("[^A-Z0-9_]+", "_");
		return sanitized.isBlank() ? "ERROR" : truncate(sanitized, 80);
	}

	private static String truncate(String value, int maximumLength) {
		return value.length() <= maximumLength ? value : value.substring(0, maximumLength);
	}

	private record ProviderOutput(String headline, String summary, List<FindingOutput> findings,
			NextActionOutput nextAction) {
	}

	private record FindingOutput(String code, Severity severity, String title, String evidence, String advice) {
		Finding toProvider() {
			return new Finding(code, severity, title, evidence, advice);
		}
	}

	private record NextActionOutput(String title, String description, List<TargetOutput> targets) {
		NextAction toProvider() {
			return new NextAction(title, description, targets.stream().map(TargetOutput::toProvider).toList());
		}
	}

	private record TargetOutput(String metric, String label, Operator operator, double value, String unit) {
		Target toProvider() {
			return new Target(metric, label, operator, value, unit);
		}
	}
}
