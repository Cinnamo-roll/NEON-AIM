package com.neonaim.ai;

import com.neonaim.common.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/ai/providers")
class AiProviderAdminController {

	private final TrainingAnalysisProviderRegistry registry;

	AiProviderAdminController(TrainingAnalysisProviderRegistry registry) {
		this.registry = registry;
	}

	@PostMapping("/test")
	ApiResponse<ConnectionTestView> test(@Valid @RequestBody ConnectionTestRequest request) {
		Instant startedAt = Instant.now();
		try {
			TrainingAnalysisProvider provider = registry.create(request.provider(), request.apiKey(), request.model());
			TrainingAnalysisProvider.ConnectionResult result = provider.testConnection();
			return ApiResponse.success(new ConnectionTestView(true, request.provider(), request.model(), result.model(),
					durationMs(startedAt), result.usage().inputTokens(), result.usage().outputTokens(), null, null));
		}
		catch (ModelProviderException exception) {
			return ApiResponse.success(new ConnectionTestView(false, request.provider(), request.model(), null,
					durationMs(startedAt), 0, 0, exception.code(), safeMessage(exception, request.apiKey())));
		}
	}

	private static long durationMs(Instant startedAt) {
		return Math.max(0, Duration.between(startedAt, Instant.now()).toMillis());
	}

	private static String safeMessage(ModelProviderException exception, String apiKey) {
		String message = exception.getMessage();
		if (message == null || message.isBlank()) return "模型通道测试失败";
		String sanitized = apiKey == null || apiKey.isBlank() ? message : message.replace(apiKey, "[REDACTED]");
		return sanitized.length() <= 300 ? sanitized : sanitized.substring(0, 300);
	}

	record ConnectionTestRequest(
			@NotBlank @Pattern(regexp = "openai|deepseek|bailian") String provider,
			@NotBlank @Size(min = 16, max = 512) String apiKey,
			@NotBlank @Size(max = 80) @Pattern(regexp = "[A-Za-z0-9._:-]+") String model) {
	}

	record ConnectionTestView(boolean success, String provider, String requestedModel, String resolvedModel,
			long durationMs, int inputTokens, int outputTokens, String failureCode, String message) {
	}
}
