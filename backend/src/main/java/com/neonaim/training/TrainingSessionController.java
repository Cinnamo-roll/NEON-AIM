package com.neonaim.training;

import com.neonaim.common.api.ApiResponse;
import com.neonaim.training.api.TrainingAnalysisResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/training/sessions")
class TrainingSessionController {

	private final TrainingSessionService service;

	TrainingSessionController(TrainingSessionService service) {
		this.service = service;
	}

	@PostMapping
	ResponseEntity<ApiResponse<TrainingSessionService.SessionDetail>> create(
			@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody TrainingSessionSubmission submission) {
		TrainingSessionService.CreateResult result = service.create(userId(jwt), submission);
		ApiResponse<TrainingSessionService.SessionDetail> response = ApiResponse.success(result.session(),
				result.created() ? "训练成绩已保存" : "训练成绩已经存在");
		if (!result.created()) {
			return ResponseEntity.ok(response);
		}
		return ResponseEntity.created(URI.create("/api/training/sessions/" + result.session().summary().id()))
				.body(response);
	}

	@GetMapping
	ApiResponse<TrainingSessionService.SessionPage> list(
			@AuthenticationPrincipal Jwt jwt,
			@RequestParam(required = false)
			@Pattern(regexp = "[a-z0-9][a-z0-9-]{0,63}") String trainingId,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
		return ApiResponse.success(service.list(userId(jwt), trainingId, page, size));
	}

	@GetMapping("/{sessionId}")
	ApiResponse<TrainingSessionService.SessionDetail> detail(
			@AuthenticationPrincipal Jwt jwt,
			@PathVariable UUID sessionId) {
		return ApiResponse.success(service.detail(userId(jwt), sessionId));
	}

	@GetMapping("/{sessionId}/analysis")
	ApiResponse<TrainingAnalysisResult> analysis(
			@AuthenticationPrincipal Jwt jwt,
			@PathVariable UUID sessionId) {
		return ApiResponse.success(service.analysis(userId(jwt), sessionId));
	}

	private static UUID userId(Jwt jwt) {
		return UUID.fromString(jwt.getSubject());
	}
}
