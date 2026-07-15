package com.neonaim.ai;

import java.util.List;
import java.util.Map;

import com.neonaim.training.api.TrainingAnalysisSnapshot;

/**
 * Structural and token ceilings applied before a provider can be called.
 */
public final class TrainingAnalysisPolicy {

	public static final int SUPPORTED_SCHEMA_VERSION = 1;
	public static final int MAX_SUMMARY_METRICS = 12;
	public static final int MAX_WINDOWS = 6;
	public static final int MAX_WINDOW_METRICS = 10;
	public static final int MAX_SIGNALS = 5;
	public static final int MAX_EVIDENCE_FIELDS = 6;
	public static final int MAX_COMPARISON_FIELDS = 8;
	public static final int MAX_FINDINGS = 3;

	private static final TokenBudget SESSION_BUDGET = new TokenBudget(900, 420);
	private static final TokenBudget CAREER_BUDGET = new TokenBudget(1_800, 450);
	public TokenBudget budgetFor(TrainingAnalysisSnapshot.Scope scope) {
		return scope == TrainingAnalysisSnapshot.Scope.SESSION ? SESSION_BUDGET : CAREER_BUDGET;
	}

	public void validate(TrainingAnalysisSnapshot snapshot) {
		if (snapshot.schemaVersion() != SUPPORTED_SCHEMA_VERSION) {
			throw new IllegalArgumentException("unsupported analysis schema version");
		}
		if (snapshot.sampleSize() <= 0) {
			throw new IllegalArgumentException("sampleSize must be positive");
		}
		validateTextLength(snapshot.sourceId(), "sourceId", 100);
		validateTextLength(snapshot.dataVersion(), "dataVersion", 100);
		validateTextLength(snapshot.trainingId(), "trainingId", 64);
		validateTextLength(snapshot.configurationKey(), "configurationKey", 160);
		validateMetrics(snapshot.summaryMetrics(), MAX_SUMMARY_METRICS, "summaryMetrics");
		if (snapshot.windows().size() > MAX_WINDOWS) {
			throw new IllegalArgumentException("analysis snapshot has too many windows");
		}
		for (TrainingAnalysisSnapshot.Window window : snapshot.windows()) {
			if (window.startMs() < 0 || window.endMs() <= window.startMs()) {
				throw new IllegalArgumentException("analysis window has invalid boundaries");
			}
			validateTextLength(window.label(), "window.label", 40);
			validateMetrics(window.metrics(), MAX_WINDOW_METRICS, "window.metrics");
		}
		if (snapshot.signals().size() > MAX_SIGNALS) {
			throw new IllegalArgumentException("analysis snapshot has too many signals");
		}
		for (TrainingAnalysisSnapshot.Signal signal : snapshot.signals()) {
			validateTextLength(signal.code(), "signal.code", 64);
			validateMetrics(signal.evidence(), MAX_EVIDENCE_FIELDS, "signal.evidence");
		}
		if (snapshot.comparison() != null) {
			if (snapshot.comparison().sampleSize() <= 0) {
				throw new IllegalArgumentException("comparison sampleSize must be positive");
			}
			validateMetrics(snapshot.comparison().deltas(), MAX_COMPARISON_FIELDS, "comparison.deltas");
		}
		if (snapshot.integrity().errors().size() > MAX_SIGNALS) {
			throw new IllegalArgumentException("analysis snapshot has too many integrity errors");
		}
		for (String error : snapshot.integrity().errors()) {
			validateTextLength(error, "integrity.error", 160);
		}
		TokenBudget budget = budgetFor(snapshot.scope());
		if (estimateInputTokens(snapshot) > budget.maxInputTokens()) {
			throw new IllegalArgumentException("analysis snapshot exceeds its input token budget");
		}
	}

	public int estimateInputTokens(TrainingAnalysisSnapshot snapshot) {
		int characters = 400 + snapshot.sourceId().length() + snapshot.dataVersion().length()
				+ snapshot.trainingId().length() + snapshot.configurationKey().length();
		characters += metricCharacters(snapshot.summaryMetrics());
		for (TrainingAnalysisSnapshot.Window window : snapshot.windows()) {
			characters += 80 + window.label().length() + metricCharacters(window.metrics());
		}
		for (TrainingAnalysisSnapshot.Signal signal : snapshot.signals()) {
			characters += 60 + signal.code().length() + metricCharacters(signal.evidence());
		}
		if (snapshot.comparison() != null) {
			characters += 50 + metricCharacters(snapshot.comparison().deltas());
		}
		characters += snapshot.integrity().errors().stream().mapToInt(String::length).sum();
		return 100 + (int) Math.ceil(characters / 3.5d);
	}

	public void validateResult(TrainingAnalysisSnapshot snapshot,
			TrainingAnalysisProvider.AnalysisResult result, TokenBudget budget,
			TrainingAiAnalysisStrategy strategy) {
		if (result.findings().size() > MAX_FINDINGS) {
			throw new IllegalStateException("provider returned too many findings");
		}
		validateTextLength(result.headline(), "result.headline", 240);
		validateTextLength(result.summary(), "result.summary", 800);
		validateTextLength(result.nextAction().title(), "result.nextAction.title", 160);
		validateTextLength(result.nextAction().description(), "result.nextAction.description", 400);
		validateTextLength(result.model(), "result.model", 120);
		for (TrainingAnalysisProvider.Finding finding : result.findings()) {
			validateTextLength(finding.code(), "result.finding.code", 64);
			validateTextLength(finding.title(), "result.finding.title", 160);
			validateTextLength(finding.evidence(), "result.finding.evidence", 400);
			validateTextLength(finding.advice(), "result.finding.advice", 400);
		}
		for (TrainingAnalysisProvider.Target target : result.nextAction().targets()) {
			validateTextLength(target.metric(), "result.target.metric", 48);
			validateTextLength(target.label(), "result.target.label", 80);
			validateTextLength(target.unit(), "result.target.unit", 24);
		}
		if (result.usage().inputTokens() > budget.maxInputTokens()
				|| result.usage().outputTokens() > budget.maxOutputTokens()) {
			throw new IllegalStateException("provider exceeded the analysis token budget");
		}
		new TrainingAnalysisQualityGate(strategy).validate(snapshot, result);
	}

	private static int metricCharacters(Map<String, Double> metrics) {
		return metrics.entrySet().stream().mapToInt(entry -> entry.getKey().length() + 24).sum();
	}

	private static void validateMetrics(Map<String, Double> metrics, int maximumSize, String field) {
		if (metrics.size() > maximumSize) {
			throw new IllegalArgumentException(field + " has too many entries");
		}
		for (Map.Entry<String, Double> entry : metrics.entrySet()) {
			validateTextLength(entry.getKey(), field + ".key", 48);
			if (entry.getValue() == null || !Double.isFinite(entry.getValue())) {
				throw new IllegalArgumentException(field + " contains a non-finite value");
			}
		}
	}

	private static void validateTextLength(String value, String field, int maximumLength) {
		if (value == null || value.isBlank() || value.length() > maximumLength) {
			throw new IllegalArgumentException(field + " is blank or too long");
		}
	}

	public record TokenBudget(int maxInputTokens, int maxOutputTokens) {

		public TokenBudget {
			if (maxInputTokens <= 0 || maxOutputTokens <= 0) {
				throw new IllegalArgumentException("token budgets must be positive");
			}

		}

		public int maximumTotalTokens() {
			return Math.addExact(maxInputTokens, maxOutputTokens);
		}
	}
}
