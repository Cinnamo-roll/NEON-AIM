package com.neonaim.ai;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

final class OpenAiCompatibleChatProvider implements TrainingAnalysisProvider {

	private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(30);
	private static final String OUTPUT_INSTRUCTIONS = """

			Return compact JSON only, with this structure. Keep every string within the length limits from the system instructions:
			{"headline":"...","summary":"...","findings":[{"code":"...","severity":"POSITIVE|OPPORTUNITY|WARNING","title":"...","evidence":"...","advice":"..."}],"nextAction":{"title":"...","description":"...","targets":[{"metric":"...","label":"...","operator":"AT_LEAST|AT_MOST","value":90,"unit":"..."}]}}
			""";

	private final HttpClient httpClient;
	private final ObjectMapper objectMapper;
	private final Profile profile;
	private final URI endpoint;
	private final String apiKey;
	private final String model;

	OpenAiCompatibleChatProvider(HttpClient httpClient, ObjectMapper objectMapper, Profile profile,
			String apiKey, String model) {
		this(httpClient, objectMapper, profile, URI.create(profile.endpoint()), apiKey, model);
	}

	OpenAiCompatibleChatProvider(HttpClient httpClient, ObjectMapper objectMapper, Profile profile,
			URI endpoint, String apiKey, String model) {
		this.httpClient = Objects.requireNonNull(httpClient, "httpClient");
		this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
		this.profile = Objects.requireNonNull(profile, "profile");
		this.endpoint = Objects.requireNonNull(endpoint, "endpoint");
		this.apiKey = requireText(apiKey, "apiKey", 512);
		this.model = requireText(model, "model", 80);
	}

	@Override
	public AnalysisResult analyze(AnalysisRequest request) {
		HttpRequest httpRequest = HttpRequest.newBuilder(endpoint)
				.timeout(REQUEST_TIMEOUT)
				.header("Authorization", "Bearer " + apiKey)
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(requestBody(request)))
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
			JsonNode choice = root.path("choices").path(0);
			if (choice.path("message").path("content").asString("").isBlank()) {
				throw new ModelProviderException("AI_CONNECTION_TEST_FAILED", "模型未能完成测试请求");
			}
			JsonNode usage = root.path("usage");
			return new ConnectionResult(root.path("model").asString(model),
					new TokenUsage(usage.path("prompt_tokens").asInt(0),
							usage.path("completion_tokens").asInt(0)));
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
		return profile.id() + "-chat:" + model;
	}

	private String requestBody(AnalysisRequest analysisRequest) {
		try {
			Map<String, Object> request = new LinkedHashMap<>();
			request.put("model", model);
			request.put("messages", List.of(
					Map.of("role", "system", "content", analysisRequest.prompt().instructions()
							+ "\nAllowed target metrics: "
							+ String.join(", ", analysisRequest.prompt().supportedTargetMetrics())
							+ OUTPUT_INSTRUCTIONS),
					Map.of("role", "user", "content", objectMapper.writeValueAsString(
							analysisRequest.snapshot()))));
			request.put("response_format", Map.of("type", "json_object"));
			request.put("max_tokens", analysisRequest.budget().maxOutputTokens());
			request.put("temperature", 0.1);
			request.put("stream", false);
			if (profile == Profile.DEEPSEEK) {
				request.put("thinking", Map.of("type", "disabled"));
			}
			else {
				request.put("enable_thinking", false);
			}
			return objectMapper.writeValueAsString(request);
		}
		catch (JacksonException exception) {
			throw new ModelProviderException("AI_REQUEST_INVALID", "AI 分析请求无法序列化", exception);
		}
	}

	private String connectionTestBody() {
		try {
			Map<String, Object> request = new LinkedHashMap<>();
			request.put("model", model);
			request.put("messages", List.of(Map.of(
					"role", "user", "content", "Return only this JSON: {\"ok\":true}")));
			request.put("response_format", Map.of("type", "json_object"));
			request.put("max_tokens", 16);
			request.put("stream", false);
			if (profile == Profile.DEEPSEEK) {
				request.put("thinking", Map.of("type", "disabled"));
			}
			else {
				request.put("enable_thinking", false);
			}
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
			usage = new TokenUsage(usageNode.path("prompt_tokens").asInt(0),
					usageNode.path("completion_tokens").asInt(0));
			JsonNode choice = root.path("choices").path(0);
			String finishReason = choice.path("finish_reason").asString("");
			if ("length".equals(finishReason)) {
				throw new ModelProviderException("AI_RESPONSE_INCOMPLETE", "AI 回复未完整生成，请重新分析", null, usage);
			}
			String content = choice.path("message").path("content").asString("");
			if (content.isBlank()) {
				throw new ModelProviderException("AI_RESPONSE_EMPTY", "AI 没有返回可用分析", null, usage);
			}
			ProviderOutput output = parseProviderOutput(content);
			return new AnalysisResult(output.headline(), output.summary(),
					output.findings().stream().map(FindingOutput::toProvider).toList(),
					output.nextAction().toProvider(), root.path("model").asString(model),
					usage);
		}
		catch (ModelProviderException exception) {
			throw exception;
		}
		catch (JacksonException | IllegalArgumentException | NullPointerException exception) {
			throw new ModelProviderException("AI_RESPONSE_INVALID", "AI 返回的结构化分析无效", exception, usage);
		}
	}

	private ProviderOutput parseProviderOutput(String content) throws JacksonException {
		JsonNode root = objectMapper.readTree(stripJsonFence(content));
		String headline = requiredText(root, "headline");
		String summary = requiredText(root, "summary");
		JsonNode findingsNode = firstPresent(root, "findings", "keyFindings", "key_findings");
		if (findingsNode == null || !findingsNode.isArray()) {
			throw new IllegalArgumentException("findings must be an array");
		}
		List<FindingOutput> findings = new ArrayList<>();
		for (JsonNode finding : findingsNode) {
			findings.add(new FindingOutput(
					normalizeFindingCode(requiredText(finding, "code")),
					parseSeverity(requiredText(finding, "severity")),
					requiredText(finding, "title"),
					requiredText(finding, "evidence"),
					requiredText(finding, "advice", "recommendation")));
		}

		JsonNode action = firstPresent(root, "nextAction", "next_action");
		if (action == null || !action.isObject()) {
			throw new IllegalArgumentException("nextAction must be an object");
		}
		JsonNode targetsNode = firstPresent(action, "targets", "goals");
		if (targetsNode == null || !targetsNode.isArray()) {
			throw new IllegalArgumentException("targets must be an array");
		}
		List<TargetOutput> targets = new ArrayList<>();
		for (JsonNode target : targetsNode) {
			String metric = normalizeMetric(requiredText(target, "metric"));
			targets.add(new TargetOutput(metric, requiredText(target, "label"),
					parseOperator(requiredText(target, "operator")), requiredNumber(target, "value"),
					optionalText(target, "unit").orElseGet(() -> defaultUnit(metric))));
		}
		return new ProviderOutput(headline, summary, findings,
				new NextActionOutput(requiredText(action, "title"),
						requiredText(action, "description", "advice"), targets));
	}

	private static JsonNode firstPresent(JsonNode node, String... names) {
		for (String name : names) {
			JsonNode value = node.get(name);
			if (value != null && !value.isNull()) return value;
		}
		return null;
	}

	private static String requiredText(JsonNode node, String... names) {
		return optionalText(node, names)
				.orElseThrow(() -> new IllegalArgumentException(names[0] + " must be text"));
	}

	private static Optional<String> optionalText(JsonNode node, String... names) {
		JsonNode value = firstPresent(node, names);
		if (value == null || !value.isString() || value.asString().isBlank()) return Optional.empty();
		return Optional.of(value.asString().trim());
	}

	private static double requiredNumber(JsonNode node, String name) {
		JsonNode value = firstPresent(node, name);
		if (value != null && value.isNumber() && Double.isFinite(value.asDouble())) return value.asDouble();
		if (value != null && value.isString()) {
			try {
				double parsed = Double.parseDouble(value.asString().replace("%", "").trim());
				if (Double.isFinite(parsed)) return parsed;
			}
			catch (NumberFormatException ignored) {
				// The common string-number form is supported; other text remains invalid.
			}
		}
		throw new IllegalArgumentException(name + " must be numeric");
	}

	private static Severity parseSeverity(String value) {
		return switch (normalizeEnum(value)) {
			case "POSITIVE", "STRENGTH", "SUCCESS" -> Severity.POSITIVE;
			case "OPPORTUNITY", "IMPROVEMENT", "ISSUE" -> Severity.OPPORTUNITY;
			case "WARNING", "RISK" -> Severity.WARNING;
			default -> throw new IllegalArgumentException("unsupported severity");
		};
	}

	private static Operator parseOperator(String value) {
		return switch (normalizeEnum(value)) {
			case "AT_LEAST", "GREATER_THAN_OR_EQUAL", "GTE", ">=" -> Operator.AT_LEAST;
			case "AT_MOST", "LESS_THAN_OR_EQUAL", "LTE", "<=" -> Operator.AT_MOST;
			default -> throw new IllegalArgumentException("unsupported operator");
		};
	}

	private static String normalizeMetric(String value) {
		return switch (value.replace("_", "").replace("-", "").toLowerCase(Locale.ROOT)) {
			case "accuracy" -> "accuracy";
			case "consistencyscore", "stability" -> "consistencyScore";
			case "targetsperminute", "tpm" -> "targetsPerMinute";
			case "averagehitinterval", "hitinterval" -> "averageHitInterval";
			case "lastphaseaccuracy" -> "lastPhaseAccuracy";
			case "maxcombo" -> "maxCombo";
			default -> value;
		};
	}

	private static String defaultUnit(String metric) {
		return switch (metric) {
			case "accuracy", "lastPhaseAccuracy" -> "%";
			case "consistencyScore" -> "分";
			case "targetsPerMinute" -> "TPM";
			case "averageHitInterval" -> "ms";
			case "maxCombo" -> "次";
			default -> "值";
		};
	}

	private static String normalizeFindingCode(String value) {
		String normalized = normalizeEnum(value).replaceAll("[^A-Z0-9_]+", "_");
		return normalized.replaceAll("^_+|_+$", "");
	}

	private static String normalizeEnum(String value) {
		return value.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
	}

	private static String stripJsonFence(String content) {
		String trimmed = content.trim();
		if (!trimmed.startsWith("```")) return trimmed;
		int firstLineEnd = trimmed.indexOf('\n');
		int closingFence = trimmed.lastIndexOf("```");
		if (firstLineEnd < 0 || closingFence <= firstLineEnd) return trimmed;
		return trimmed.substring(firstLineEnd + 1, closingFence).trim();
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
			// The status code remains sufficient and response bodies are never logged.
		}
		String code = status == 401 ? "AI_API_KEY_INVALID"
				: status == 429 ? "AI_RATE_LIMITED" : "AI_PROVIDER_" + sanitizeCode(providerCode);
		return new ModelProviderException(code, truncate(providerMessage, 300));
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

	enum Profile {
		DEEPSEEK("deepseek", "https://api.deepseek.com/chat/completions"),
		BAILIAN("bailian", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");

		private final String id;
		private final String endpoint;

		Profile(String id, String endpoint) {
			this.id = id;
			this.endpoint = endpoint;
		}

		String id() { return id; }
		String endpoint() { return endpoint; }
	}

	private record ProviderOutput(String headline, String summary, List<FindingOutput> findings,
			NextActionOutput nextAction) {
	}

	private record FindingOutput(String code, Severity severity, String title, String evidence, String advice) {
		Finding toProvider() { return new Finding(code, severity, title, evidence, advice); }
	}

	private record NextActionOutput(String title, String description, List<TargetOutput> targets) {
		NextAction toProvider() {
			return new NextAction(title, description, targets.stream().map(TargetOutput::toProvider).toList());
		}
	}

	private record TargetOutput(String metric, String label, Operator operator, double value, String unit) {
		Target toProvider() { return new Target(metric, label, operator, value, unit); }
	}
}
