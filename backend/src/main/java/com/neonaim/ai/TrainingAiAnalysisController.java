package com.neonaim.ai;

import com.neonaim.common.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/training/sessions/{sessionId}/ai-analysis")
class TrainingAiAnalysisController {

	private final TrainingAiAnalysisService service;

	TrainingAiAnalysisController(TrainingAiAnalysisService service) {
		this.service = service;
	}

	@PostMapping
	ApiResponse<TrainingAiAnalysisService.JobView> trigger(@AuthenticationPrincipal Jwt jwt,
			@PathVariable UUID sessionId, @Valid @RequestBody TriggerRequest request) {
		return ApiResponse.success(service.trigger(userId(jwt), sessionId, request.provider(), request.apiKey(), request.model()),
				"AI 深度分析已开始");
	}

	@GetMapping
	ApiResponse<TrainingAiAnalysisService.JobView> latest(@AuthenticationPrincipal Jwt jwt,
			@PathVariable UUID sessionId) {
		return ApiResponse.success(service.latest(userId(jwt), sessionId));
	}

	private static UUID userId(Jwt jwt) {
		return UUID.fromString(jwt.getSubject());
	}

	record TriggerRequest(@NotBlank @Pattern(regexp = "openai|deepseek|bailian") String provider,
			@NotBlank @Size(min = 16, max = 512) String apiKey,
			@NotBlank @Size(max = 80) @Pattern(regexp = "[A-Za-z0-9._:-]+") String model) {
	}
}
