package com.neonaim.training.api;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Compact deterministic evidence produced by a training mode. AI consumers use
 * this bounded snapshot instead of loading raw gameplay events.
 */
public record TrainingAnalysisSnapshot(int schemaVersion, Scope scope, String sourceId, String dataVersion,
		String trainingId, String configurationKey, int sampleSize, Map<String, Double> summaryMetrics,
		List<Window> windows, List<Signal> signals, Comparison comparison, Integrity integrity) {

	public static final int CURRENT_SCHEMA_VERSION = 1;

	public TrainingAnalysisSnapshot {
		if (schemaVersion != CURRENT_SCHEMA_VERSION) {
			throw new IllegalArgumentException("unsupported training analysis snapshot schema");
		}
		Objects.requireNonNull(scope, "scope");
		sourceId = requireText(sourceId, "sourceId");
		dataVersion = requireText(dataVersion, "dataVersion");
		trainingId = requireText(trainingId, "trainingId");
		configurationKey = requireText(configurationKey, "configurationKey");
		summaryMetrics = Map.copyOf(Objects.requireNonNull(summaryMetrics, "summaryMetrics"));
		windows = List.copyOf(Objects.requireNonNull(windows, "windows"));
		signals = List.copyOf(Objects.requireNonNull(signals, "signals"));
		Objects.requireNonNull(integrity, "integrity");
	}

	private static String requireText(String value, String field) {
		if (value == null || value.isBlank()) {
			throw new IllegalArgumentException(field + " must not be blank");
		}
		return value;
	}

	public enum Scope {
		SESSION,
		CAREER
	}

	public enum Severity {
		POSITIVE,
		OPPORTUNITY,
		WARNING
	}

	public record Window(String label, long startMs, long endMs, Map<String, Double> metrics) {

		public Window {
			label = requireText(label, "window.label");
			metrics = Map.copyOf(Objects.requireNonNull(metrics, "metrics"));
		}
	}

	public record Signal(String code, Severity severity, Map<String, Double> evidence) {

		public Signal {
			code = requireText(code, "signal.code");
			Objects.requireNonNull(severity, "severity");
			evidence = Map.copyOf(Objects.requireNonNull(evidence, "evidence"));
		}
	}

	public record Comparison(int sampleSize, Map<String, Double> deltas) {

		public Comparison {
			deltas = Map.copyOf(Objects.requireNonNull(deltas, "deltas"));
		}
	}

	public record Integrity(boolean passed, List<String> errors) {

		public Integrity {
			errors = List.copyOf(Objects.requireNonNull(errors, "errors"));
		}
	}
}
