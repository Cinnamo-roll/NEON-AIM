package com.neonaim.ai;

import com.neonaim.training.api.TrainingAnalysisSnapshot;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class TrainingAnalysisQualityGate {

	private static final Pattern NUMBER = Pattern.compile("[-+]?\\d[\\d,]*(?:\\.\\d+)?");
	private static final Pattern FINDING_CODE = Pattern.compile("[A-Z0-9_]{3,64}");
	private static final List<String> UNSUPPORTED_CLAIMS = List.of(
			"鼠标轨迹", "移动轨迹", "瞄准路径", "目标位置", "靶点位置", "反应时间",
			"远低于目标", "初步趋势", "疲劳", "注意力分散", "注意力下降", "专注力",
			"分心", "走神", "紧张", "焦虑", "心态失衡", "体力不足", "体能下降",
			"点击坐标", "准星路径", "mouse path", "mouse trajectory", "aim path",
			"target position", "reaction time", "click coordinates", "far below target", "initial trend",
			"fatigue", "tiredness", "attention loss", "attention lapse", "distracted", "distraction",
			"lost focus", "loss of focus", "anxiety", "nervousness", "mental state", "physical condition",
			"firstaccuracy", "lastaccuracy", "accuracydelta", "consistencyscore", "averagetargetlifetime",
			"averagehitinterval", "medianhitinterval", "fastesthitinterval", "slowesthitinterval",
			"targetsperminute", "targetsperminutedelta", "firsttargetsperminute", "lasttargetsperminute",
			"maxcombo", "targetaccuracy", "targetconsistency", "scoreperminute", "comparablesamplesize");

	private final TrainingAiAnalysisStrategy strategy;

	TrainingAnalysisQualityGate(TrainingAiAnalysisStrategy strategy) {
		this.strategy = strategy;
	}

	void validate(TrainingAnalysisSnapshot snapshot, TrainingAnalysisProvider.AnalysisResult result) {
		if (result.findings().isEmpty() || result.findings().size() > TrainingAnalysisPolicy.MAX_FINDINGS) {
			throw new IllegalStateException("provider must return between one and three findings");
		}
		List<Double> evidenceValues = evidenceValues(snapshot);
		Set<String> suppliedSignalCodes = new HashSet<>();
		boolean hasPositiveSignal = false;
		for (TrainingAnalysisSnapshot.Signal signal : snapshot.signals()) {
			suppliedSignalCodes.add(signal.code());
			if (signal.severity() == TrainingAnalysisSnapshot.Severity.POSITIVE) hasPositiveSignal = true;
		}
		boolean hasPositiveFinding = false;
		assertNoUnsupportedClaims(result.headline());
		assertNumericClaimsGrounded(result.headline(), evidenceValues);
		assertNoUnsupportedClaims(result.summary());
		assertNumericClaimsGrounded(result.summary(), evidenceValues);
		for (TrainingAnalysisProvider.Finding finding : result.findings()) {
			if (finding.severity() == TrainingAnalysisProvider.Severity.POSITIVE) hasPositiveFinding = true;
			if (!FINDING_CODE.matcher(finding.code()).matches()) {
				throw new IllegalStateException("provider returned an invalid finding code");
			}
			assertNoUnsupportedClaims(finding.title());
			assertNumericClaimsGrounded(finding.title(), evidenceValues);
			assertNoUnsupportedClaims(finding.evidence());
			assertNoUnsupportedClaims(finding.advice());
			assertNumericClaimsGrounded(finding.advice(), evidenceValues);
			NumericGrounding grounding = numericGrounding(finding.evidence(), evidenceValues);
			if (!grounding.grounded()
					&& (grounding.hasNumbers() || !suppliedSignalCodes.contains(finding.code()))) {
				throw new IllegalStateException("finding evidence is not grounded in the analysis snapshot");
			}
		}
		if (hasPositiveSignal && !hasPositiveFinding) {
			throw new IllegalStateException("provider omitted an evidenced strength");
		}
		List<Double> nextActionValues = new ArrayList<>(evidenceValues);
		for (TrainingAnalysisProvider.Target target : result.nextAction().targets()) {
			assertNoUnsupportedClaims(target.label());
			strategy.validateTarget(snapshot, target);
			nextActionValues.add(target.value());
		}
		assertNoUnsupportedClaims(result.nextAction().title());
		assertNumericClaimsGrounded(result.nextAction().title(), nextActionValues);
		assertNoUnsupportedClaims(result.nextAction().description());
		assertNumericClaimsGrounded(result.nextAction().description(), nextActionValues);
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

	private static NumericGrounding numericGrounding(String evidence, List<Double> evidenceValues) {
		Matcher matcher = NUMBER.matcher(evidence);
		boolean hasNumbers = false;
		while (matcher.find()) {
			hasNumbers = true;
			double cited;
			try {
				cited = Double.parseDouble(matcher.group().replace(",", ""));
			}
			catch (NumberFormatException ignored) {
				return new NumericGrounding(true, false);
			}
			boolean citedValueExists = false;
			for (double actual : evidenceValues) {
				double tolerance = Math.max(0.15d, Math.abs(actual) * 0.012d);
				if (Math.abs(cited - actual) <= tolerance
						|| Math.abs(Math.abs(cited) - Math.abs(actual)) <= tolerance) {
					citedValueExists = true;
					break;
				}
			}
			if (!citedValueExists) return new NumericGrounding(true, false);
		}
		return new NumericGrounding(hasNumbers, hasNumbers);
	}

	private static void assertNoUnsupportedClaims(String value) {
		if (containsUnsupportedClaim(value)) {
			throw new IllegalStateException("provider referenced data that was not supplied");
		}
	}

	private static void assertNumericClaimsGrounded(String value, List<Double> evidenceValues) {
		NumericGrounding grounding = numericGrounding(value, evidenceValues);
		if (grounding.hasNumbers() && !grounding.grounded()) {
			throw new IllegalStateException("user-facing number is not grounded in the analysis snapshot");
		}
	}

	static boolean containsUnsupportedClaim(String value) {
		String normalized = value.toLowerCase(Locale.ROOT);
		for (String claim : UNSUPPORTED_CLAIMS) {
			if (normalized.contains(claim)) return true;
		}
		return false;
	}

	private record NumericGrounding(boolean hasNumbers, boolean grounded) {
	}

}
