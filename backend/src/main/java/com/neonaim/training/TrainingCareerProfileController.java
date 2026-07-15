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

	private final TrainingCareerProfileRegistry registry;

	TrainingCareerProfileController(TrainingCareerProfileRegistry registry) {
		this.registry = registry;
	}

	@GetMapping
	ApiResponse<?> profile(@AuthenticationPrincipal Jwt jwt,
			@PathVariable @Pattern(regexp = "[a-z0-9][a-z0-9-]{0,63}") String trainingId) {
		return ApiResponse.success(registry.profile(UUID.fromString(jwt.getSubject()), trainingId));
	}
}
