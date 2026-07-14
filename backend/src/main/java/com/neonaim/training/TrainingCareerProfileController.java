package com.neonaim.training;

import com.neonaim.common.api.ApiResponse;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/training/career/{trainingId}/profile")
class TrainingCareerProfileController {

	private final TrainingCareerProfileService service;

	TrainingCareerProfileController(TrainingCareerProfileService service) {
		this.service = service;
	}

	@GetMapping
	ApiResponse<TrainingCareerProfileService.ProfileView> profile(@AuthenticationPrincipal Jwt jwt,
			@PathVariable @Pattern(regexp = "grid-shot") String trainingId) {
		return ApiResponse.success(service.profile(UUID.fromString(jwt.getSubject()), trainingId));
	}
}
