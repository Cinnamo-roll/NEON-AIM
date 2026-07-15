package com.neonaim.ai;

import com.neonaim.common.api.ApiResponse;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
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
			@PathVariable @Pattern(regexp = "[a-z0-9][a-z0-9-]{0,63}") String trainingId) {
		return ApiResponse.success(service.trigger(userId(jwt), trainingId), "AI 综合分析已开始");
	}

	@GetMapping
	ApiResponse<TrainingCareerAiAnalysisService.JobView> latest(@AuthenticationPrincipal Jwt jwt,
			@PathVariable @Pattern(regexp = "[a-z0-9][a-z0-9-]{0,63}") String trainingId) {
		return ApiResponse.success(service.latest(userId(jwt), trainingId));
	}

	private static UUID userId(Jwt jwt) {
		return UUID.fromString(jwt.getSubject());
	}

}
