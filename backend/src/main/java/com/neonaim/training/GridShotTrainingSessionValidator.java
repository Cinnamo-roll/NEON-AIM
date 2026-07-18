package com.neonaim.training;

import com.neonaim.common.error.ApiException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

@Component
class GridShotTrainingSessionValidator implements TrainingSessionValidator {

	private static final double METRIC_TOLERANCE = 0.2d;

	@Override
	public String trainingId() {
		return "grid-shot";
	}

	@Override
	public void validate(TrainingSessionSubmission submission) {
		validateConfiguration(submission);
		if ("benchmark".equals(submission.sessionType())) validateBenchmark(submission);
		validateDetail(submission);
		validateAnalysisSnapshot(submission);
	}

	private void validateConfiguration(TrainingSessionSubmission submission) {
		JsonNode configuration = submission.configuration();
		String targetSize = configuration.path("targetSize").asString();
		long durationSeconds = submission.durationMs() / 1_000;
		boolean valid = submission.modeVersion() == 1
				&& submission.scoringVersion() == 1
				&& submission.durationMs() % 1_000 == 0
				&& Set.of(30L, 60L, 90L).contains(durationSeconds)
				&& configuration.path("duration").asLong(-1) == durationSeconds
				&& Set.of("small", "medium", "large").contains(targetSize)
				&& configuration.path("activeTargetCount").asInt(-1) == 3
				&& ("grid-shot:" + durationSeconds + "s:" + targetSize).equals(submission.configurationKey());
		if (!valid) throw invalid("TRAINING_CONFIGURATION_INVALID", "Grid Shot 训练配置与记录不一致");
	}

	@Override
	public Map<String, Double> coachingMetrics(TrainingSessionSubmission submission) {
		Map<String, Double> metrics = new LinkedHashMap<>();
		metrics.put("accuracy", submission.summary().accuracy());
		metrics.put("consistencyScore", submission.summary().consistencyScore());
		metrics.put("targetsPerMinute", submission.summary().targetsPerMinute());
		metrics.put("averageHitInterval", submission.summary().averageHitInterval());
		metrics.put("maxCombo", (double) submission.summary().maxCombo());
		JsonNode windows = submission.analysisSnapshot().path("windows");
		double lastPhaseAccuracy = submission.summary().accuracy();
		if (windows.isArray() && !windows.isEmpty()) {
			JsonNode value = windows.get(windows.size() - 1).get("accuracy");
			if (value != null && value.isNumber()) lastPhaseAccuracy = value.asDouble();
		}
		metrics.put("lastPhaseAccuracy", lastPhaseAccuracy);
		return Map.copyOf(metrics);
	}

	private void validateBenchmark(TrainingSessionSubmission submission) {
		JsonNode configuration = submission.configuration();
		boolean valid = "grid-shot:60s:medium".equals(submission.configurationKey())
				&& submission.modeVersion() == 1
				&& submission.scoringVersion() == 1
				&& submission.durationMs() == 60_000
				&& configuration.path("duration").asInt() == 60
				&& "medium".equals(configuration.path("targetSize").asString())
				&& configuration.path("activeTargetCount").asInt() == 3;
		if (!valid) throw invalid("TRAINING_BENCHMARK_CONFIGURATION_INVALID", "标准训练必须使用固定规则");
	}

	private void validateDetail(TrainingSessionSubmission submission) {
		JsonNode segments = submission.detail().get("segments");
		JsonNode events = submission.detail().get("events");
		if (segments == null || !segments.isArray() || events == null || !events.isArray()) {
			throw invalid("TRAINING_DETAIL_INVALID", "训练详情缺少时间切片或事件记录");
		}
		int expectedSegments = (int) Math.ceil(submission.durationMs() / 5_000d);
		if (segments.size() != expectedSegments || segments.size() > 120 || events.size() > 2_000) {
			throw invalid("TRAINING_DETAIL_INVALID", "训练详情数量无效");
		}

		EventMetrics eventMetrics = analyzeEvents(events, submission);
		long expectedStart = 0;
		for (int index = 0; index < segments.size(); index += 1) {
			JsonNode segment = segments.get(index);
			long startMs = segment.path("startMs").asLong(-1);
			long endMs = segment.path("endMs").asLong(-1);
			if (startMs != expectedStart || endMs <= startMs || endMs - startMs > 5_000
					|| endMs > submission.durationMs()) {
				throw invalid("TRAINING_SEGMENT_INVALID", "训练时间切片不连续");
			}
			expectedStart = endMs;
			EventMetrics expected = metricsInRange(events, startMs, endMs, index == segments.size() - 1);
			validateWindowMetrics(segment, expected, endMs - startMs, "TRAINING_SEGMENT_INVALID");
		}
		if (expectedStart != submission.durationMs()) {
			throw invalid("TRAINING_SUMMARY_MISMATCH", "训练汇总与详细事件不一致");
		}
		validateSummary(submission.summary(), eventMetrics, submission.durationMs());
	}

	private EventMetrics analyzeEvents(JsonNode events, TrainingSessionSubmission submission) {
		Set<String> ids = new HashSet<>();
		List<Double> intervals = new ArrayList<>();
		List<Double> targetLifetimes = new ArrayList<>();
		int hits = 0;
		int misses = 0;
		int combo = 0;
		int maxCombo = 0;
		double score = 0;
		double previousElapsed = -1;
		double previousHitElapsed = -1;
		for (JsonNode event : events) {
			String id = event.path("id").asString();
			if (id.isBlank() || !ids.add(id)
					|| !submission.clientSessionId().equals(event.path("sessionId").asString())) {
				throw invalid("TRAINING_EVENT_INVALID", "训练事件标识无效");
			}
			double timestamp = finiteNumber(event, "timestamp");
			double elapsedMs = finiteNumber(event, "elapsedMs");
			if (elapsedMs < 0 || elapsedMs > submission.durationMs() || elapsedMs < previousElapsed) {
				throw invalid("TRAINING_EVENT_INVALID", "训练事件时间或顺序无效");
			}
			previousElapsed = elapsedMs;
			String type = event.path("type").asString();
			boolean hit = "hit".equals(type);
			if (hit) hits += 1;
			else if ("miss".equals(type)) misses += 1;
			else throw invalid("TRAINING_EVENT_INVALID", "训练事件类型无效");

			int comboBefore = event.path("comboBefore").asInt(-1);
			int comboAfter = event.path("comboAfter").asInt(-1);
			int expectedAfter = hit ? combo + 1 : 0;
			if (comboBefore != combo || comboAfter != expectedAfter) {
				throw invalid("TRAINING_EVENT_INVALID", "训练连击事件不连续");
			}
			combo = comboAfter;
			maxCombo = Math.max(maxCombo, comboAfter);
			double derivedInterval = hit && previousHitElapsed >= 0 ? elapsedMs - previousHitElapsed : -1;
			List<Double> scoringIntervals = new ArrayList<>(intervals);
			if (derivedInterval >= 0) scoringIntervals.add(derivedInterval);

			double base = finiteNumber(event, "baseScore");
			double speed = finiteNumber(event, "speedBonus");
			double comboBonus = finiteNumber(event, "comboBonus");
			double stability = finiteNumber(event, "stabilityBonus");
			double total = finiteNumber(event, "totalScore");
			double expectedBase = hit ? 100 : 0;
			double expectedSpeed = hit ? speedBonus(derivedInterval) : 0;
			double expectedCombo = hit ? comboBonus(comboAfter) : 0;
			double expectedStability = hit && isStable(scoringIntervals) ? 5 : 0;
			if (!approximatelyEqual(base, expectedBase) || !approximatelyEqual(speed, expectedSpeed)
					|| !approximatelyEqual(comboBonus, expectedCombo)
					|| !approximatelyEqual(stability, expectedStability)
					|| !approximatelyEqual(total, base + speed + comboBonus + stability)) {
				throw invalid("TRAINING_EVENT_INVALID", "训练事件计分无效");
			}
			score += total;

			if (!hit) continue;
			if (event.get("targetActivatedAt") != null && event.get("targetLifetimeMs") == null) {
				throw invalid("TRAINING_EVENT_INVALID", "目标激活时间缺少对应停留时间");
			}
			if (event.get("targetLifetimeMs") != null) {
				double targetLifetime = finiteNumber(event, "targetLifetimeMs");
				if (targetLifetime < 0) throw invalid("TRAINING_EVENT_INVALID", "目标停留时间无效");
				if (event.get("targetActivatedAt") != null) {
					double activatedAt = finiteNumber(event, "targetActivatedAt");
					if (activatedAt > timestamp || !approximatelyEqual(targetLifetime, timestamp - activatedAt)) {
						throw invalid("TRAINING_EVENT_INVALID", "目标停留时间与事件时间不一致");
					}
				}
				targetLifetimes.add(targetLifetime);
			}
			if (previousHitElapsed < 0) {
				if (hasNumber(event, "previousHitAt") || hasNumber(event, "hitIntervalMs")) {
					throw invalid("TRAINING_EVENT_INVALID", "首个命中不应包含命中间隔");
				}
			}
			else {
				double expectedInterval = derivedInterval;
				boolean hasPrevious = event.get("previousHitAt") != null;
				boolean hasInterval = event.get("hitIntervalMs") != null;
				if (hasPrevious || hasInterval) {
					if (!hasPrevious || !hasInterval
							|| !approximatelyEqual(finiteNumber(event, "previousHitAt"), previousHitElapsed)
							|| !approximatelyEqual(finiteNumber(event, "hitIntervalMs"), expectedInterval)) {
						throw invalid("TRAINING_EVENT_INVALID", "命中间隔与事件时间不一致");
					}
				}
				intervals.add(expectedInterval);
			}
			previousHitElapsed = elapsedMs;
		}
		return new EventMetrics(hits, misses, score, maxCombo, List.copyOf(intervals),
				List.copyOf(targetLifetimes));
	}

	private EventMetrics metricsInRange(JsonNode events, long startMs, long endMs, boolean finalWindow) {
		int hits = 0;
		int misses = 0;
		int maxCombo = 0;
		double score = 0;
		List<Double> hitTimes = new ArrayList<>();
		List<Double> targetLifetimes = new ArrayList<>();
		for (JsonNode event : events) {
			double elapsed = event.path("elapsedMs").asDouble();
			if (elapsed < startMs || (finalWindow ? elapsed > endMs : elapsed >= endMs)) continue;
			if ("hit".equals(event.path("type").asString())) {
				hits += 1;
				hitTimes.add(elapsed);
				if (hasNumber(event, "targetLifetimeMs")) targetLifetimes.add(event.path("targetLifetimeMs").asDouble());
			}
			else misses += 1;
			maxCombo = Math.max(maxCombo, event.path("comboAfter").asInt(0));
			score += event.path("totalScore").asDouble();
		}
		List<Double> intervals = new ArrayList<>();
		for (int index = 1; index < hitTimes.size(); index += 1) {
			intervals.add(hitTimes.get(index) - hitTimes.get(index - 1));
		}
		return new EventMetrics(hits, misses, score, maxCombo, List.copyOf(intervals),
				List.copyOf(targetLifetimes));
	}

	private void validateSummary(TrainingSessionSubmission.Summary summary, EventMetrics expected,
			long durationMs) {
		double accuracy = accuracy(expected);
		double tpm = durationMs == 0 ? 0 : expected.hits() / (durationMs / 60_000d);
		if (summary.hits() != expected.hits() || summary.misses() != expected.misses()
				|| !approximatelyEqual(summary.score(), expected.score())
				|| !approximatelyEqual(summary.accuracy(), accuracy)
				|| !approximatelyEqual(summary.targetsPerMinute(), tpm)
				|| !approximatelyEqual(summary.averageHitInterval(), average(expected.intervals()))
				|| !approximatelyEqual(summary.consistencyScore(), consistency(expected))
				|| summary.maxCombo() != expected.maxCombo()
				|| !summary.grade().equals(expectedGrade(accuracy, tpm, consistency(expected), expected.maxCombo()))) {
			throw invalid("TRAINING_SUMMARY_MISMATCH", "训练汇总与原始事件不一致");
		}
	}

	private void validateWindowMetrics(JsonNode window, EventMetrics expected, long durationMs, String code) {
		double tpm = durationMs == 0 ? 0 : expected.hits() / (durationMs / 60_000d);
		if (window.path("hits").asInt(-1) != expected.hits()
				|| window.path("misses").asInt(-1) != expected.misses()
				|| !approximatelyEqual(finiteNumber(window, "accuracy"), accuracy(expected))
				|| !approximatelyEqual(finiteNumber(window, "targetsPerMinute"), tpm)
				|| !approximatelyEqual(finiteNumber(window, "averageHitInterval"), average(expected.intervals()))
				|| !approximatelyEqual(finiteNumber(window, "consistencyScore"), consistency(expected))
				|| !approximatelyEqual(finiteNumber(window, "score"), expected.score())
				|| hasNumber(window, "medianHitInterval")
						&& !approximatelyEqual(window.path("medianHitInterval").asDouble(), median(expected.intervals()))
				|| hasNumber(window, "averageTargetLifetime")
						&& !approximatelyEqual(window.path("averageTargetLifetime").asDouble(), average(expected.targetLifetimes()))
				|| hasNumber(window, "maxCombo") && window.path("maxCombo").asInt(-1) != expected.maxCombo()) {
			throw invalid(code, "训练时间窗口与原始事件不一致");
		}
	}

	private void validateAnalysisSnapshot(TrainingSessionSubmission submission) {
		JsonNode snapshot = submission.analysisSnapshot();
		JsonNode events = submission.detail().path("events");
		JsonNode training = snapshot.path("training");
		JsonNode source = snapshot.path("source");
		JsonNode summary = snapshot.path("summary");
		JsonNode windows = snapshot.path("windows");
		JsonNode signals = snapshot.path("signals");
		JsonNode integrity = snapshot.path("integrity");
		if (snapshot.path("schemaVersion").asInt(-1) != 1 || !"session".equals(snapshot.path("scope").asString())
				|| !submission.trainingId().equals(training.path("id").asString())
				|| submission.modeVersion() != training.path("modeVersion").asInt(-1)
				|| submission.scoringVersion() != training.path("scoringVersion").asInt(-1)
				|| !submission.configurationKey().equals(training.path("configurationKey").asString())
				|| !submission.clientSessionId().equals(source.path("sessionId").asString())
				|| !sameInstant(source.path("completedAt").asString(), submission.completedAt())
				|| !windows.isArray() || windows.size() != 3 || !signals.isArray() || signals.size() > 5
				|| integrity.path("passed").asBoolean() != submission.integrity().passed()) {
			throw invalid("TRAINING_ANALYSIS_INVALID", "训练分析快照与会话不一致");
		}
		if (!approximatelyEqual(finiteNumber(summary, "score"), submission.summary().score())
				|| summary.path("hits").asInt(-1) != submission.summary().hits()
				|| summary.path("misses").asInt(-1) != submission.summary().misses()
				|| !approximatelyEqual(finiteNumber(summary, "accuracy"), submission.summary().accuracy())
				|| !approximatelyEqual(finiteNumber(summary, "targetsPerMinute"), submission.summary().targetsPerMinute())
				|| !approximatelyEqual(finiteNumber(summary, "averageHitInterval"), submission.summary().averageHitInterval())
				|| !approximatelyEqual(finiteNumber(summary, "consistencyScore"), submission.summary().consistencyScore())
				|| summary.path("maxCombo").asInt(-1) != submission.summary().maxCombo()
				|| !submission.summary().grade().equals(summary.path("grade").asString())) {
			throw invalid("TRAINING_ANALYSIS_INVALID", "训练分析快照汇总不一致");
		}
		EventMetrics allEvents = metricsInRange(events, 0, submission.durationMs(), true);
		validateOptionalSummaryMetric(summary, "medianHitInterval", median(allEvents.intervals()));
		validateOptionalSummaryMetric(summary, "fastestHitInterval",
				allEvents.intervals().isEmpty() ? 0 : allEvents.intervals().stream().mapToDouble(Double::doubleValue).min().orElse(0));
		validateOptionalSummaryMetric(summary, "slowestHitInterval",
				allEvents.intervals().isEmpty() ? 0 : allEvents.intervals().stream().mapToDouble(Double::doubleValue).max().orElse(0));
		validateOptionalSummaryMetric(summary, "averageTargetLifetime", average(allEvents.targetLifetimes()));
		for (int index = 0; index < windows.size(); index += 1) {
			long startMs = Math.round(submission.durationMs() * index / 3d);
			long endMs = index == 2 ? submission.durationMs()
					: Math.round(submission.durationMs() * (index + 1) / 3d);
			JsonNode window = windows.get(index);
			if (!("phase" + (index + 1)).equals(window.path("label").asString())
					|| window.path("startMs").asLong(-1) != startMs
					|| window.path("endMs").asLong(-1) != endMs) {
				throw invalid("TRAINING_ANALYSIS_INVALID", "训练分析阶段边界无效");
			}
			validateWindowMetrics(window, metricsInRange(events, startMs, endMs, index == 2),
					endMs - startMs, "TRAINING_ANALYSIS_INVALID");
		}
		validateSignals(signals, summary, windows, submission.integrity().passed());
		if (submission.integrity().passed() && !submission.integrity().errors().isEmpty()) {
			throw invalid("TRAINING_ANALYSIS_INVALID", "有效训练不应包含完整性错误");
		}
	}

	private void validateSignals(JsonNode signals, JsonNode summary, JsonNode windows, boolean integrityPassed) {
		if (!integrityPassed && (signals.size() != 1
				|| !"INTEGRITY_REVIEW_REQUIRED".equals(signals.get(0).path("code").asString()))) {
			throw invalid("TRAINING_ANALYSIS_INVALID", "无效训练只能输出完整性复核信号");
		}
		Set<String> codes = new HashSet<>();
		for (JsonNode signal : signals) {
			String code = signal.path("code").asString();
			if (!codes.add(code)) throw invalid("TRAINING_ANALYSIS_INVALID", "训练分析信号重复");
			double accuracy = finiteNumber(summary, "accuracy");
			double consistency = finiteNumber(summary, "consistencyScore");
			double interval = finiteNumber(summary, "averageHitInterval");
			double medianInterval = hasNumber(summary, "medianHitInterval")
					? summary.path("medianHitInterval").asDouble() : interval;
			double hits = summary.path("hits").asInt();
			double misses = summary.path("misses").asInt();
			double maxCombo = summary.path("maxCombo").asInt();
			JsonNode first = windows.get(0);
			JsonNode last = windows.get(windows.size() - 1);
			double firstAccuracy = finiteNumber(first, "accuracy");
			double lastAccuracy = finiteNumber(last, "accuracy");
			double accuracyDelta = round(lastAccuracy - firstAccuracy);
			double firstTpm = finiteNumber(first, "targetsPerMinute");
			double lastTpm = finiteNumber(last, "targetsPerMinute");
			double paceDelta = round(lastTpm - firstTpm);
			boolean phaseEvidence = first.path("hits").asInt() + first.path("misses").asInt() >= 3
					&& last.path("hits").asInt() + last.path("misses").asInt() >= 3;
			SignalExpectation expected = switch (code) {
				case "INTEGRITY_REVIEW_REQUIRED" -> new SignalExpectation(!integrityPassed, "warning", Map.of());
				case "CONTROL_FOUNDATION" -> new SignalExpectation(integrityPassed && accuracy >= 90 && consistency >= 75,
						"positive", Map.of("accuracy", accuracy, "consistencyScore", consistency, "maxCombo", maxCombo));
				case "COMBO_STRENGTH" -> new SignalExpectation(integrityPassed && maxCombo >= 8, "positive",
						Map.of("maxCombo", maxCombo, "hits", hits));
				case "ACCURACY_LIMITS_PACE" -> new SignalExpectation(accuracy < 85, "opportunity",
						Map.of("accuracy", accuracy, "hits", hits, "misses", misses));
				case "LATE_ACCURACY_DROP" -> new SignalExpectation(phaseEvidence
						&& accuracyDelta <= -5 && paceDelta < 10,
						"opportunity", Map.of("firstAccuracy", firstAccuracy, "lastAccuracy", lastAccuracy,
								"accuracyDelta", accuracyDelta, "firstTargetsPerMinute", firstTpm,
								"lastTargetsPerMinute", lastTpm, "targetsPerMinuteDelta", paceDelta));
				case "PACE_CONTROL_TRADEOFF" -> new SignalExpectation(phaseEvidence
						&& accuracyDelta <= -5 && paceDelta >= 10,
						"opportunity", Map.of("firstAccuracy", firstAccuracy, "lastAccuracy", lastAccuracy,
								"accuracyDelta", accuracyDelta, "firstTargetsPerMinute", firstTpm,
								"lastTargetsPerMinute", lastTpm, "targetsPerMinuteDelta", paceDelta));
				case "STRONG_FINISH" -> new SignalExpectation(phaseEvidence
						&& accuracyDelta >= 5 && lastAccuracy >= accuracy
						&& paceDelta >= 0, "positive",
						Map.of("firstAccuracy", firstAccuracy, "lastAccuracy", lastAccuracy,
								"accuracyDelta", accuracyDelta, "targetsPerMinuteDelta", paceDelta));
				case "RHYTHM_INSTABILITY" -> new SignalExpectation(hits >= 4 && consistency < 70, "opportunity",
						Map.of("consistencyScore", consistency, "averageHitInterval", interval, "maxCombo", maxCombo));
				case "PACE_OPPORTUNITY" -> new SignalExpectation(accuracy >= 90 && interval > 400, "opportunity",
						Map.of("accuracy", accuracy, "averageHitInterval", interval,
								"medianHitInterval", medianInterval));
				case "LATE_PACE_DROP" -> new SignalExpectation(phaseEvidence
						&& paceDelta <= -Math.max(10, firstTpm * 0.1)
						&& accuracyDelta > -5 && accuracyDelta < 3, "opportunity",
						Map.of("firstTargetsPerMinute", firstTpm, "lastTargetsPerMinute", lastTpm,
								"targetsPerMinuteDelta", paceDelta, "accuracyDelta", accuracyDelta));
				case "BEST_PHASE_CONTROL" -> bestPhaseExpectation(windows);
				default -> throw invalid("TRAINING_ANALYSIS_INVALID", "训练分析包含未知信号");
			};
			if (!expected.valid() || !expected.severity().equals(signal.path("severity").asString())) {
				throw invalid("TRAINING_ANALYSIS_INVALID", "训练分析信号与本局数据不一致");
			}
			JsonNode evidence = signal.path("evidence");
			if (!evidence.isObject() || evidence.size() != expected.evidence().size()) {
				throw invalid("TRAINING_ANALYSIS_INVALID", "训练分析证据不完整");
			}
			for (Map.Entry<String, Double> entry : expected.evidence().entrySet()) {
				if (!approximatelyEqual(finiteNumber(evidence, entry.getKey()), entry.getValue())) {
					throw invalid("TRAINING_ANALYSIS_INVALID", "训练分析证据与本局数据不一致");
				}
			}
		}
	}

	private SignalExpectation bestPhaseExpectation(JsonNode windows) {
		int bestIndex = -1;
		double bestAccuracy = -1;
		double bestTpm = -1;
		for (int index = 0; index < windows.size(); index += 1) {
			JsonNode window = windows.get(index);
			if (window.path("hits").asInt() + window.path("misses").asInt() < 3) continue;
			double candidateAccuracy = finiteNumber(window, "accuracy");
			double candidateTpm = finiteNumber(window, "targetsPerMinute");
			if (candidateAccuracy > bestAccuracy || candidateAccuracy == bestAccuracy && candidateTpm > bestTpm) {
				bestIndex = index;
				bestAccuracy = candidateAccuracy;
				bestTpm = candidateTpm;
			}
		}
		if (bestIndex < 0) return new SignalExpectation(false, "positive", Map.of());
		JsonNode best = windows.get(bestIndex);
		return new SignalExpectation(true, "positive", Map.of(
				"phase", (double) bestIndex + 1,
				"accuracy", bestAccuracy,
				"targetsPerMinute", bestTpm,
				"hits", (double) best.path("hits").asInt(),
				"misses", (double) best.path("misses").asInt()));
	}

	private void validateOptionalSummaryMetric(JsonNode summary, String field, double expected) {
		if (summary.get(field) != null && !approximatelyEqual(finiteNumber(summary, field), expected)) {
			throw invalid("TRAINING_ANALYSIS_INVALID", "训练分析扩展指标与原始事件不一致");
		}
	}

	private static boolean hasNumber(JsonNode node, String field) {
		JsonNode value = node.get(field);
		return value != null && value.isNumber() && Double.isFinite(value.asDouble());
	}

	private static boolean sameInstant(String value, Instant expected) {
		try {
			return Instant.parse(value).equals(expected);
		}
		catch (RuntimeException ignored) {
			return false;
		}
	}

	private static double accuracy(EventMetrics metrics) {
		int attempts = metrics.hits() + metrics.misses();
		return attempts == 0 ? 0 : metrics.hits() * 100d / attempts;
	}

	private static double average(List<Double> values) {
		return values.isEmpty() ? 0 : values.stream().mapToDouble(Double::doubleValue).average().orElse(0);
	}

	private static double median(List<Double> values) {
		if (values.isEmpty()) return 0;
		List<Double> ordered = values.stream().sorted().toList();
		int middle = ordered.size() / 2;
		return ordered.size() % 2 == 1 ? ordered.get(middle)
				: (ordered.get(middle - 1) + ordered.get(middle)) / 2;
	}

	private static double consistency(EventMetrics metrics) {
		if (metrics.intervals().size() < 3) return 0;
		double center = median(metrics.intervals());
		if (center <= 0) return 0;
		List<Double> deviations = metrics.intervals().stream()
				.map(value -> Math.abs(value - center)).toList();
		double robustCoefficient = 1.4826 * median(deviations) / center;
		double rhythmScore = 100 * clamp(1 - robustCoefficient / 0.35, 0, 1);
		int attempts = metrics.hits() + metrics.misses();
		double missRate = attempts == 0 ? 0 : metrics.misses() / (double) attempts;
		double missFactor = clamp(1 - missRate * 0.5, 0.5, 1);
		return Math.round(clamp(rhythmScore * missFactor, 0, 100));
	}

	private static double speedBonus(double interval) {
		if (interval < 0) return 0;
		if (interval <= 180) return 50;
		if (interval <= 230) return 40;
		if (interval <= 300) return 30;
		if (interval <= 400) return 20;
		if (interval <= 550) return 10;
		return 0;
	}

	private static double comboBonus(int combo) {
		if (combo >= 50) return 20;
		if (combo >= 30) return 15;
		if (combo >= 20) return 10;
		if (combo >= 10) return 5;
		return 0;
	}

	private static boolean isStable(List<Double> intervals) {
		if (intervals.size() < 5) return false;
		List<Double> recent = intervals.subList(intervals.size() - 5, intervals.size());
		double mean = average(recent);
		if (mean <= 0) return false;
		double variance = recent.stream().mapToDouble(value -> Math.pow(value - mean, 2)).average().orElse(0);
		return Math.sqrt(variance) / mean <= 0.16;
	}

	private static double clamp(double value, double minimum, double maximum) {
		return Math.min(maximum, Math.max(minimum, value));
	}

	private static String expectedGrade(double accuracy, double targetsPerMinute, double consistency,
			int maxCombo) {
		double speedScore = clamp(targetsPerMinute / 180d * 100d, 0, 100);
		double controlScore = clamp(maxCombo / 50d * 100d, 0, 100);
		double composite = accuracy * 0.4 + speedScore * 0.25 + consistency * 0.2 + controlScore * 0.15;
		String raw = gradeBand(composite, new double[] { 93, 85, 75, 60, 45 });
		String accuracyCap = gradeBand(accuracy, new double[] { 97, 93, 88, 80, 70 });
		String hardGateCap;
		if (accuracy < 93 || targetsPerMinute < 150 || consistency < 75 || maxCombo < 30) hardGateCap = "A";
		else if (accuracy < 97 || targetsPerMinute < 180 || consistency < 85 || maxCombo < 50) hardGateCap = "S";
		else hardGateCap = "S+";
		return lowestGrade(raw, accuracyCap, hardGateCap);
	}

	private static String gradeBand(double value, double[] thresholds) {
		String[] grades = { "S+", "S", "A", "B", "C" };
		for (int index = 0; index < thresholds.length; index += 1) {
			if (value >= thresholds[index]) return grades[index];
		}
		return "D";
	}

	private static String lowestGrade(String... grades) {
		List<String> order = List.of("D", "C", "B", "A", "S", "S+");
		String lowest = grades[0];
		for (String grade : grades) {
			if (order.indexOf(grade) < order.indexOf(lowest)) lowest = grade;
		}
		return lowest;
	}

	private static double round(double value) {
		return Math.round(value * 10d) / 10d;
	}

	private double finiteNumber(JsonNode node, String field) {
		JsonNode value = node.get(field);
		if (value == null || !value.isNumber() || !Double.isFinite(value.asDouble())) {
			throw invalid("TRAINING_NUMBER_INVALID", "训练数据包含无效数值");
		}
		return value.asDouble();
	}

	private static boolean approximatelyEqual(double left, double right) {
		return Math.abs(left - right) <= METRIC_TOLERANCE;
	}

	private static ApiException invalid(String code, String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, code, message);
	}

	private record EventMetrics(int hits, int misses, double score, int maxCombo,
			List<Double> intervals, List<Double> targetLifetimes) {}

	private record SignalExpectation(boolean valid, String severity, Map<String, Double> evidence) {}
}
