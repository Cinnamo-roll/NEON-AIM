package com.neonaim.training;

import com.neonaim.common.error.ApiException;
import java.util.LinkedHashMap;
import java.util.Map;
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
		if ("benchmark".equals(submission.sessionType())) validateBenchmark(submission);
		validateDetail(submission);
		validateAnalysisSnapshot(submission);
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
		if (!valid) throw invalid("TRAINING_BENCHMARK_CONFIGURATION_INVALID", "基准训练必须使用固定规则");
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

		int eventHits = 0;
		int eventMisses = 0;
		double eventScore = 0;
		for (JsonNode event : events) {
			String type = event.path("type").asString();
			if ("hit".equals(type)) eventHits += 1;
			else if ("miss".equals(type)) eventMisses += 1;
			else throw invalid("TRAINING_EVENT_INVALID", "训练事件类型无效");
			double elapsedMs = finiteNumber(event, "elapsedMs");
			if (elapsedMs < 0 || elapsedMs > submission.durationMs()) {
				throw invalid("TRAINING_EVENT_INVALID", "训练事件时间超出范围");
			}
			eventScore += finiteNumber(event, "totalScore");
		}

		int segmentHits = 0;
		int segmentMisses = 0;
		double segmentScore = 0;
		long expectedStart = 0;
		for (JsonNode segment : segments) {
			long startMs = segment.path("startMs").asLong(-1);
			long endMs = segment.path("endMs").asLong(-1);
			if (startMs != expectedStart || endMs <= startMs || endMs - startMs > 5_000
					|| endMs > submission.durationMs()) {
				throw invalid("TRAINING_SEGMENT_INVALID", "训练时间切片不连续");
			}
			expectedStart = endMs;
			segmentHits += segment.path("hits").asInt(-1);
			segmentMisses += segment.path("misses").asInt(-1);
			segmentScore += finiteNumber(segment, "score");
		}
		if (expectedStart != submission.durationMs()
				|| eventHits != submission.summary().hits() || eventMisses != submission.summary().misses()
				|| segmentHits != eventHits || segmentMisses != eventMisses
				|| !approximatelyEqual(eventScore, submission.summary().score())
				|| !approximatelyEqual(segmentScore, submission.summary().score())) {
			throw invalid("TRAINING_SUMMARY_MISMATCH", "训练汇总与详细事件不一致");
		}
		double expectedAccuracy = eventHits + eventMisses == 0 ? 0 : eventHits * 100d / (eventHits + eventMisses);
		double expectedTpm = eventHits / (submission.durationMs() / 60_000d);
		if (!approximatelyEqual(expectedAccuracy, submission.summary().accuracy())
				|| !approximatelyEqual(expectedTpm, submission.summary().targetsPerMinute())) {
			throw invalid("TRAINING_SUMMARY_MISMATCH", "训练准确率或节奏汇总不一致");
		}
	}

	private void validateAnalysisSnapshot(TrainingSessionSubmission submission) {
		JsonNode snapshot = submission.analysisSnapshot();
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
				|| !windows.isArray() || windows.size() > 6 || !signals.isArray() || signals.size() > 5
				|| integrity.path("passed").asBoolean() != submission.integrity().passed()) {
			throw invalid("TRAINING_ANALYSIS_INVALID", "训练分析快照与会话不一致");
		}
		if (!approximatelyEqual(finiteNumber(summary, "score"), submission.summary().score())
				|| summary.path("hits").asInt(-1) != submission.summary().hits()
				|| summary.path("misses").asInt(-1) != submission.summary().misses()
				|| !approximatelyEqual(finiteNumber(summary, "accuracy"), submission.summary().accuracy())
				|| !approximatelyEqual(finiteNumber(summary, "targetsPerMinute"), submission.summary().targetsPerMinute())) {
			throw invalid("TRAINING_ANALYSIS_INVALID", "训练分析快照汇总不一致");
		}
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
}
