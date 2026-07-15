package com.neonaim.ai;

import java.util.List;
import java.util.Objects;

import com.neonaim.training.api.TrainingAnalysisSnapshot;

/**
 * Provider boundary for model-specific integrations. Providers receive a bounded,
 * precomputed snapshot rather than raw gameplay events or an unbounded history.
 */
public interface TrainingAnalysisProvider {

	AnalysisResult analyze(AnalysisRequest request);

	ConnectionResult testConnection();

	String providerId();

	record AnalysisRequest(TrainingAnalysisSnapshot snapshot, TrainingAnalysisPolicy.TokenBudget budget,
			TrainingAiAnalysisStrategy.PromptSpec prompt) {

		public AnalysisRequest {
			Objects.requireNonNull(snapshot, "snapshot");
			Objects.requireNonNull(budget, "budget");
			Objects.requireNonNull(prompt, "prompt");
		}
	}

	record AnalysisResult(String headline, String summary, List<Finding> findings, NextAction nextAction,
			String model, TokenUsage usage) {

		public AnalysisResult {
			if (headline == null || headline.isBlank()) {
				throw new IllegalArgumentException("headline must not be blank");
			}
			if (summary == null || summary.isBlank()) {
				throw new IllegalArgumentException("summary must not be blank");
			}
			findings = List.copyOf(Objects.requireNonNull(findings, "findings"));
			Objects.requireNonNull(nextAction, "nextAction");
			if (model == null || model.isBlank()) {
				throw new IllegalArgumentException("model must not be blank");
			}
			Objects.requireNonNull(usage, "usage");
		}
	}

	record Finding(String code, Severity severity, String title, String evidence, String advice) {

		public Finding {
			if (code == null || code.isBlank() || title == null || title.isBlank()
					|| evidence == null || evidence.isBlank()
					|| advice == null || advice.isBlank()) {
				throw new IllegalArgumentException("finding fields must not be blank");
			}
			Objects.requireNonNull(severity, "severity");
		}
	}

	enum Severity {
		POSITIVE,
		OPPORTUNITY,
		WARNING
	}

	record NextAction(String title, String description, List<Target> targets) {

		public NextAction {
			if (title == null || title.isBlank() || description == null || description.isBlank()) {
				throw new IllegalArgumentException("next action fields must not be blank");
			}
			targets = List.copyOf(Objects.requireNonNull(targets, "targets"));
			if (targets.isEmpty() || targets.size() > 3) {
				throw new IllegalArgumentException("next action must contain between one and three targets");
			}
		}
	}

	record Target(String metric, String label, Operator operator, double value, String unit) {

		public Target {
			if (metric == null || metric.isBlank() || label == null || label.isBlank()
					|| unit == null || unit.isBlank() || !Double.isFinite(value)) {
				throw new IllegalArgumentException("target fields are invalid");
			}
			Objects.requireNonNull(operator, "operator");
		}
	}

	enum Operator {
		AT_LEAST,
		AT_MOST
	}

	record TokenUsage(int inputTokens, int outputTokens) {

		public TokenUsage {
			if (inputTokens < 0 || outputTokens < 0) {
				throw new IllegalArgumentException("token usage must not be negative");
			}
		}

		public int totalTokens() {
			return Math.addExact(inputTokens, outputTokens);
		}
	}

	record ConnectionResult(String model, TokenUsage usage) {

		public ConnectionResult {
			if (model == null || model.isBlank()) {
				throw new IllegalArgumentException("model must not be blank");
			}
			Objects.requireNonNull(usage, "usage");
		}
	}
}
