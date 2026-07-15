package com.neonaim.user;

import com.neonaim.common.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/users/me/training-preferences")
class UserTrainingPreferencesController {

	private final UserTrainingPreferencesService preferences;

	UserTrainingPreferencesController(UserTrainingPreferencesService preferences) {
		this.preferences = preferences;
	}

	@GetMapping
	ApiResponse<UserTrainingPreferencesService.PreferencesView> current(@AuthenticationPrincipal Jwt jwt) {
		return ApiResponse.success(preferences.current(UUID.fromString(jwt.getSubject())));
	}

	@PutMapping
	ApiResponse<UserTrainingPreferencesService.PreferencesView> save(
			@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody SavePreferencesRequest request) {
		return ApiResponse.success(
				preferences.save(UUID.fromString(jwt.getSubject()), request.preferences()),
				"账号设置已同步");
	}

	record SavePreferencesRequest(@NotNull(message = "设置内容不能为空") JsonNode preferences) {
	}
}
