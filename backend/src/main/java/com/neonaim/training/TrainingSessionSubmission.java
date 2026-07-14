package com.neonaim.training;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import tools.jackson.databind.JsonNode;

public record TrainingSessionSubmission(
		@NotBlank @Size(max = 64) String clientSessionId,
		@NotBlank @Pattern(regexp = "[a-z0-9][a-z0-9-]{0,63}") String trainingId,
		@Min(1) @Max(10_000) int modeVersion,
		@Min(1) @Max(10_000) int scoringVersion,
		@NotBlank @Size(max = 160) String configurationKey,
		@NotBlank @Pattern(regexp = "benchmark|practice") String sessionType,
		@NotNull Instant startedAt,
		@NotNull Instant completedAt,
		@Min(1) @Max(3_600_000) long durationMs,
		@NotNull JsonNode configuration,
		@Valid @NotNull Summary summary,
		@NotNull JsonNode detail,
		@NotNull JsonNode analysisSnapshot,
		@Valid @NotNull Integrity integrity) {

	public record Summary(
			@DecimalMin("0") double score,
			@Min(0) int hits,
			@Min(0) int misses,
			@DecimalMin("0") @DecimalMax("100") double accuracy,
			@DecimalMin("0") double targetsPerMinute,
			@DecimalMin("0") double averageHitInterval,
			@DecimalMin("0") @DecimalMax("100") double consistencyScore,
			@Min(0) int maxCombo,
			@NotBlank @Size(max = 16) String grade) {
	}

	public record Integrity(boolean passed,
			@Size(max = 5) List<@NotBlank @Size(max = 160) String> errors) {

		public Integrity {
			errors = errors == null ? List.of() : List.copyOf(errors);
		}
	}
}
