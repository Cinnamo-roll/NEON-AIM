package com.neonaim.training.api;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * Stable, provider-neutral result returned by both deterministic training rules
 * and future model-backed analysis providers.
 */
public record TrainingAnalysisResult(int schemaVersion, Status status, Source source, String engineVersion,
		String providerId, String model, String promptVersion, String headline, String summary,
		List<Finding> findings, NextAction nextAction, TokenUsage usage, Instant generatedAt) {

	public static final int CURRENT_SCHEMA_VERSION = 1;

	public TrainingAnalysisResult {
		if (schemaVersion != CURRENT_SCHEMA_VERSION) {
			throw new IllegalArgumentException("unsupported training analysis result schema");
		}
		Objects.requireNonNull(status, "status");
		Objects.requireNonNull(source, "source");
		engineVersion = requireText(engineVersion, "engineVersion");
		headline = requireText(headline, "headline");
		summary = requireText(summary, "summary");
		findings = List.copyOf(Objects.requireNonNull(findings, "findings"));
		if (findings.size() > 3) {
			throw new IllegalArgumentException("analysis result has too many findings");
		}
		Objects.requireNonNull(nextAction, "nextAction");
		Objects.requireNonNull(usage, "usage");
		Objects.requireNonNull(generatedAt, "generatedAt");
	}

	public static TrainingAnalysisResult rules(String engineVersion, String headline, String summary,
			List<Finding> findings, NextAction nextAction, Instant generatedAt) {
		return new TrainingAnalysisResult(CURRENT_SCHEMA_VERSION, Status.READY, Source.RULES, engineVersion,
				null, null, null, headline, summary, findings, nextAction, new TokenUsage(0, 0), generatedAt);
	}

	private static String requireText(String value, String field) {
		if (value == null || value.isBlank()) {
			throw new IllegalArgumentException(field + " must not be blank");
		}
		return value;
	}

	public enum Status {
		PENDING,
		READY,
		FALLBACK,
		FAILED
	}

	public enum Source {
		RULES,
		AI
	}

	public enum Severity {
		POSITIVE,
		OPPORTUNITY,
		WARNING
	}

	public enum Operator {
		AT_LEAST,
		AT_MOST
	}

	public record Finding(String code, Severity severity, String title, String evidence, String advice) {

		public Finding {
			code = requireText(code, "finding.code");
			Objects.requireNonNull(severity, "severity");
			title = requireText(title, "finding.title");
			evidence = requireText(evidence, "finding.evidence");
			advice = requireText(advice, "finding.advice");
		}
	}

	public record NextAction(String title, String description, List<Target> targets) {

		public NextAction {
			title = requireText(title, "nextAction.title");
			description = requireText(description, "nextAction.description");
			targets = List.copyOf(Objects.requireNonNull(targets, "targets"));
			if (targets.isEmpty() || targets.size() > 3) {
				throw new IllegalArgumentException("nextAction must contain between one and three targets");
			}
		}
	}

	public record Target(String metric, String label, Operator operator, double value, String unit) {

		public Target {
			metric = requireText(metric, "target.metric");
			label = requireText(label, "target.label");
			Objects.requireNonNull(operator, "operator");
			if (!Double.isFinite(value)) {
				throw new IllegalArgumentException("target.value must be finite");
			}
			unit = requireText(unit, "target.unit");
		}
	}

	public record TokenUsage(int inputTokens, int outputTokens) {

		public TokenUsage {
			if (inputTokens < 0 || outputTokens < 0) {
				throw new IllegalArgumentException("token usage must not be negative");
			}
		}

		public int totalTokens() {
			return Math.addExact(inputTokens, outputTokens);
		}
	}
}
