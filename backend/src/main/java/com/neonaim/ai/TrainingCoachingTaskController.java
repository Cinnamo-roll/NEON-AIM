package com.neonaim.ai;

import com.neonaim.common.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
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
@RequestMapping("/api/training/career/{trainingId}/coaching-task")
class TrainingCoachingTaskController {

	private final TrainingCoachingTaskService service;

	TrainingCoachingTaskController(TrainingCoachingTaskService service) {
		this.service = service;
	}

	@GetMapping
	ApiResponse<TrainingCoachingTaskService.TaskView> latest(@AuthenticationPrincipal Jwt jwt,
			@PathVariable @Pattern(regexp = "grid-shot") String trainingId) {
		return ApiResponse.success(service.latest(userId(jwt), trainingId));
	}

	@PostMapping
	ApiResponse<TrainingCoachingTaskService.TaskView> adopt(@AuthenticationPrincipal Jwt jwt,
			@PathVariable @Pattern(regexp = "grid-shot") String trainingId,
			@Valid @RequestBody AdoptRequest request) {
		return ApiResponse.success(service.adopt(userId(jwt), trainingId, request.analysisCallId()),
				"训练目标已启用");
	}

	private static UUID userId(Jwt jwt) {
		return UUID.fromString(jwt.getSubject());
	}

	record AdoptRequest(@NotNull UUID analysisCallId) {
	}
}
