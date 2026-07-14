package com.neonaim.ai;

import com.neonaim.training.api.TrainingAnalysisSnapshot;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class TrainingAnalysisQualityGate {

	private static final Pattern NUMBER = Pattern.compile("[-+]?\\d[\\d,]*(?:\\.\\d+)?");
	private static final Pattern FINDING_CODE = Pattern.compile("[A-Z0-9_]{3,64}");
	private static final Set<String> ALLOWED_TARGET_METRICS = Set.of(
			"accuracy", "consistencyScore", "targetsPerMinute", "averageHitInterval",
			"lastPhaseAccuracy", "maxCombo");
	private static final List<String> UNSUPPORTED_CLAIMS = List.of(
			"鼠标轨迹", "移动轨迹", "瞄准路径", "目标位置", "靶点位置", "反应时间",
			"点击坐标", "准星路径", "mouse path", "mouse trajectory", "aim path",
			"target position", "reaction time", "click coordinates");

	void validate(TrainingAnalysisSnapshot snapshot, TrainingAnalysisProvider.AnalysisResult result) {
		if (result.findings().isEmpty() || result.findings().size() > TrainingAnalysisPolicy.MAX_FINDINGS) {
			throw new IllegalStateException("provider must return between one and three findings");
		}
		List<Double> evidenceValues = evidenceValues(snapshot);
		assertNoUnsupportedClaims(result.headline());
		assertNoUnsupportedClaims(result.summary());
		for (TrainingAnalysisProvider.Finding finding : result.findings()) {
			if (!FINDING_CODE.matcher(finding.code()).matches()) {
				throw new IllegalStateException("provider returned an invalid finding code");
			}
			assertNoUnsupportedClaims(finding.title());
			assertNoUnsupportedClaims(finding.evidence());
			assertNoUnsupportedClaims(finding.advice());
			if (!containsGroundedNumber(finding.evidence(), evidenceValues)) {
				throw new IllegalStateException("finding evidence is not grounded in the analysis snapshot");
			}
		}
		assertNoUnsupportedClaims(result.nextAction().title());
		assertNoUnsupportedClaims(result.nextAction().description());
		for (TrainingAnalysisProvider.Target target : result.nextAction().targets()) {
			validateTarget(target);
		}
	}

	private static List<Double> evidenceValues(TrainingAnalysisSnapshot snapshot) {
		List<Double> values = new ArrayList<>();
		values.add((double) snapshot.sampleSize());
		values.addAll(snapshot.summaryMetrics().values());
		for (TrainingAnalysisSnapshot.Window window : snapshot.windows()) {
			values.add(window.startMs() / 1_000d);
			values.add(window.endMs() / 1_000d);
			values.addAll(window.metrics().values());
		}
		for (TrainingAnalysisSnapshot.Signal signal : snapshot.signals()) {
			values.addAll(signal.evidence().values());
		}
		if (snapshot.comparison() != null) {
			values.add((double) snapshot.comparison().sampleSize());
			values.addAll(snapshot.comparison().deltas().values());
		}
		return List.copyOf(values);
	}

	private static boolean containsGroundedNumber(String evidence, List<Double> evidenceValues) {
		Matcher matcher = NUMBER.matcher(evidence);
		while (matcher.find()) {
			double cited;
			try {
				cited = Double.parseDouble(matcher.group().replace(",", ""));
			}
			catch (NumberFormatException ignored) {
				continue;
			}
			for (double actual : evidenceValues) {
				double tolerance = Math.max(0.15d, Math.abs(actual) * 0.012d);
				if (Math.abs(cited - actual) <= tolerance) return true;
			}
		}
		return false;
	}

	private static void validateTarget(TrainingAnalysisProvider.Target target) {
		if (!ALLOWED_TARGET_METRICS.contains(target.metric())) {
			throw new IllegalStateException("provider returned an unsupported target metric");
		}
		double value = target.value();
		switch (target.metric()) {
			case "accuracy", "consistencyScore", "lastPhaseAccuracy" -> requireRange(value, 0, 100);
			case "targetsPerMinute" -> requireRange(value, 1, 600);
			case "averageHitInterval" -> requireRange(value, 50, 2_000);
			case "maxCombo" -> requireRange(value, 1, 1_000);
			default -> throw new IllegalStateException("provider returned an unsupported target metric");
		}
		if ("averageHitInterval".equals(target.metric())
				&& target.operator() != TrainingAnalysisProvider.Operator.AT_MOST) {
			throw new IllegalStateException("average hit interval targets must use AT_MOST");
		}
		if (!"averageHitInterval".equals(target.metric())
				&& target.operator() != TrainingAnalysisProvider.Operator.AT_LEAST) {
			throw new IllegalStateException("improvement targets must use AT_LEAST");
		}
	}

	private static void assertNoUnsupportedClaims(String value) {
		String normalized = value.toLowerCase(Locale.ROOT);
		for (String claim : UNSUPPORTED_CLAIMS) {
			if (normalized.contains(claim)) {
				throw new IllegalStateException("provider referenced data that was not supplied");
			}
		}
	}

	private static void requireRange(double value, double minimum, double maximum) {
		if (value < minimum || value > maximum) {
			throw new IllegalStateException("provider returned an out-of-range target");
		}
	}
}
