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
@RequestMapping("/api/training/career/{trainingId}/ai-analysis")
class TrainingCareerAiAnalysisController {

	private final TrainingCareerAiAnalysisService service;

	TrainingCareerAiAnalysisController(TrainingCareerAiAnalysisService service) {
		this.service = service;
	}

	@PostMapping
	ApiResponse<TrainingCareerAiAnalysisService.JobView> trigger(@AuthenticationPrincipal Jwt jwt,
			@PathVariable @Pattern(regexp = "grid-shot") String trainingId,
			@Valid @RequestBody TriggerRequest request) {
		return ApiResponse.success(service.trigger(userId(jwt), trainingId, request.provider(),
				request.apiKey(), request.model()), "AI 综合分析已开始");
	}

	@GetMapping
	ApiResponse<TrainingCareerAiAnalysisService.JobView> latest(@AuthenticationPrincipal Jwt jwt,
			@PathVariable @Pattern(regexp = "grid-shot") String trainingId) {
		return ApiResponse.success(service.latest(userId(jwt), trainingId));
	}

	private static UUID userId(Jwt jwt) {
		return UUID.fromString(jwt.getSubject());
	}

	record TriggerRequest(@NotBlank @Pattern(regexp = "openai|deepseek|bailian") String provider,
			@NotBlank @Size(min = 16, max = 512) String apiKey,
			@NotBlank @Size(max = 80) @Pattern(regexp = "[A-Za-z0-9._:-]+") String model) {
	}
}
