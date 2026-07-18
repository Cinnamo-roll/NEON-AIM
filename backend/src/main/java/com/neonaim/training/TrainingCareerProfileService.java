package com.neonaim.training;

import com.neonaim.common.error.ApiException;
import com.neonaim.training.api.TrainingAnalysisSnapshot;
import com.neonaim.training.api.TrainingCareerAnalysisOperations.CareerContext;
import com.neonaim.training.api.TrainingCareerAnalysisOperations.Confidence;
import java.io.Serializable;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.ToDoubleFunction;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
@SuppressWarnings("serial")
class TrainingCareerProfileService implements TrainingCareerProfileStrategy {

	static final String CACHE_NAME = "trainingCareerProfiles";
	static final int PROFILE_SCHEMA_VERSION = 1;
	static final String TRAINING_ID = "grid-shot";
	static final String PROFILE_VERSION = "grid-shot-career-profile-v2";
	private static final int MIN_COMPARABLE_SAMPLE = 3;
	private static final int MAX_PROFILE_SESSIONS = 500;
	private static final int RECENT_ANALYSIS_SESSIONS = 6;
	private static final int TREND_WINDOW_SIZE = 3;

	private final TrainingSessionRepository repository;
	private final ObjectMapper objectMapper;
	private final Clock clock;

	TrainingCareerProfileService(TrainingSessionRepository repository, ObjectMapper objectMapper, Clock clock) {
		this.repository = repository;
		this.objectMapper = objectMapper;
		this.clock = clock;
	}

	@Override
	public String trainingId() {
		return TRAINING_ID;
	}

	@Override
	@Cacheable(cacheNames = CACHE_NAME, key = "#userId.toString() + ':grid-shot'", sync = true)
	@Transactional(readOnly = true)
	public Object profile(UUID userId) {
		return projection(userId).profile();
	}

	@Transactional(readOnly = true)
	ProfileView profile(UUID userId, String trainingId) {
		requireSupportedTraining(trainingId);
		return projection(userId).profile();
	}

	@Override
	@Transactional(readOnly = true)
	public CareerContext loadCareerAnalysisContext(UUID userId) {
		List<TrainingCareerCohortAggregateView> aggregates = repository.findCareerCohortAggregates(
				userId, TRAINING_ID, TrainingSession.IntegrityStatus.VALID);
		long sampleSize = aggregates.stream().mapToLong(TrainingCareerCohortAggregateView::sessionCount).sum();
		if (sampleSize < MIN_COMPARABLE_SAMPLE) {
			throw new ApiException(HttpStatus.CONFLICT, "CAREER_SAMPLE_TOO_SMALL",
					"至少需要 3 局有效的 GRID SHOT 训练记录后再生成综合分析");
		}

		List<TrainingCareerSessionView> recent = repository.findRecentValidCareerSessions(
				userId, TRAINING_ID, TrainingSession.IntegrityStatus.VALID,
				PageRequest.of(0, RECENT_ANALYSIS_SESSIONS));
		if (recent.isEmpty()) {
			throw new IllegalStateException("career aggregates exist without a recent valid session");
		}

		Map<CohortKey, Long> cohortSizes = cohortSizes(aggregates);
		TrainingAnalysisSnapshot.Comparison comparison = careerComparison(userId, cohortSizes);
		int boundedSampleSize = boundedInt(sampleSize);
		int comparableSampleSize = boundedInt(cohortSizes.values().stream().mapToLong(Long::longValue)
				.max().orElse(0));
		TrainingAnalysisSnapshot snapshot = analysisSnapshot(userId, aggregates, recent,
				cohortSizes.size(), boundedSampleSize, comparison);
		Confidence confidence = sampleSize >= 10 ? Confidence.STABLE
				: sampleSize >= 5 ? Confidence.LOW : Confidence.INITIAL;
		return new CareerContext(recent.getFirst().id(), snapshot, confidence,
				boundedSampleSize, comparableSampleSize, cohortSizes.size());
	}

	CareerContext loadCareerAnalysisContext(UUID userId, String trainingId) {
		requireSupportedTraining(trainingId);
		return loadCareerAnalysisContext(userId);
	}

	private static void requireSupportedTraining(String trainingId) {
		if (!TRAINING_ID.equals(trainingId)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "TRAINING_UNSUPPORTED", "该训练模式尚未开放能力档案");
		}
	}

	private Projection projection(UUID userId) {
		List<TrainingCareerSessionView> sessions = repository
				.findCareerSessionsByUserIdAndTrainingId(userId, TRAINING_ID,
						PageRequest.of(0, MAX_PROFILE_SESSIONS))
				.getContent();
		List<TrainingCareerSessionView> valid = sessions.stream()
				.filter(session -> session.integrityStatus() == TrainingSession.IntegrityStatus.VALID)
				.toList();
		Map<CohortKey, List<TrainingCareerSessionView>> cohorts = new LinkedHashMap<>();
		for (TrainingCareerSessionView session : valid) {
			CohortKey key = new CohortKey(session.configurationKey(), session.modeVersion(), session.scoringVersion());
			cohorts.computeIfAbsent(key, ignored -> new ArrayList<>()).add(session);
		}
		List<TrainingCareerSessionView> selected = List.of();
		for (List<TrainingCareerSessionView> cohort : cohorts.values()) {
			if (cohort.size() > selected.size()) selected = cohort;
		}
		List<Measurement> comparable = selected.stream().map(this::measurement).toList();

		ProfileConfidence confidence = confidence(comparable.size());
		String dataVersion = dataVersion(comparable);
		List<DimensionProfile> dimensions = dimensions(comparable);
		List<String> capabilityCodes = dimensions.stream().map(DimensionProfile::code).toList();
		Instant updatedAt = valid.isEmpty() ? null : valid.getFirst().completedAt();
		CohortDefinition cohort = comparable.isEmpty() ? null : new CohortDefinition(
				comparable.getFirst().session().configurationKey(), comparable.getFirst().session().modeVersion(),
				comparable.getFirst().session().scoringVersion());
		ProfileView view = new ProfileView(PROFILE_SCHEMA_VERSION, PROFILE_VERSION, dataVersion,
				TRAINING_ID, cohort,
				new SampleSummary(sessions.size(), valid.size(), comparable.size(), cohorts.size(), confidence),
				new Coverage(comparable.isEmpty() ? 0 : dimensions.size(), dimensions.size(), capabilityCodes),
				dimensions, comparable.stream().limit(3).map(value -> value.session().id()).toList(),
				updatedAt, clock.instant());
		return new Projection(view, comparable);
	}

	private List<DimensionProfile> dimensions(List<Measurement> sessions) {
		MetricProfile accuracy = metric("accuracy", "%", Direction.HIGHER_IS_BETTER, 1d,
				sessions, value -> value.session().accuracy());
		MetricProfile targetsPerMinute = metric("targetsPerMinute", "TPM", Direction.HIGHER_IS_BETTER, 4d,
				sessions, value -> value.session().targetsPerMinute());
		MetricProfile averageHitInterval = metric("averageHitInterval", "ms", Direction.LOWER_IS_BETTER, 10d,
				sessions, value -> value.session().averageHitInterval());
		MetricProfile consistencyScore = metric("consistencyScore", "分", Direction.HIGHER_IS_BETTER, 4d,
				sessions, value -> value.session().consistencyScore());
		MetricProfile lastPhaseAccuracy = metric("lastPhaseAccuracy", "%", Direction.HIGHER_IS_BETTER, 1d,
				sessions, Measurement::lastPhaseAccuracy);
		MetricProfile phaseAccuracyChange = metric("phaseAccuracyChange", "百分点", Direction.HIGHER_IS_BETTER, 1d,
				sessions, Measurement::phaseAccuracyChange);
		return List.of(
				new DimensionProfile("CLICK_PRECISION", accuracy.code(), accuracy.trend(), List.of(accuracy)),
				new DimensionProfile("TARGET_SWITCHING", targetsPerMinute.code(), targetsPerMinute.trend(),
						List.of(targetsPerMinute, averageHitInterval)),
				new DimensionProfile("RHYTHM_STABILITY", consistencyScore.code(), consistencyScore.trend(),
						List.of(consistencyScore)),
				new DimensionProfile("SUSTAINED_CONTROL", lastPhaseAccuracy.code(), lastPhaseAccuracy.trend(),
						List.of(lastPhaseAccuracy, phaseAccuracyChange)));
	}

	private static MetricProfile metric(String code, String unit, Direction direction, double threshold,
			List<Measurement> sessions, ToDoubleFunction<Measurement> extractor) {
		if (sessions.isEmpty()) {
			return new MetricProfile(code, unit, direction, null, null, null, null, TrendStatus.INSUFFICIENT);
		}
		List<Measurement> recent = sessions.subList(0, Math.min(TREND_WINDOW_SIZE, sessions.size()));
		double current = average(recent, extractor);
		double lifetime = average(sessions, extractor);
		double best = direction == Direction.HIGHER_IS_BETTER
				? sessions.stream().mapToDouble(extractor).max().orElse(current)
				: sessions.stream().mapToDouble(extractor).min().orElse(current);
		Double delta = null;
		TrendStatus trend = TrendStatus.INSUFFICIENT;
		if (sessions.size() >= TREND_WINDOW_SIZE * 2) {
			List<Measurement> previous = sessions.subList(TREND_WINDOW_SIZE, TREND_WINDOW_SIZE * 2);
			delta = current - average(previous, extractor);
			double improvement = direction == Direction.HIGHER_IS_BETTER ? delta : -delta;
			trend = improvement >= threshold ? TrendStatus.IMPROVING
					: improvement <= -threshold ? TrendStatus.DECLINING : TrendStatus.STABLE;
		}
		return new MetricProfile(code, unit, direction, current, lifetime, best, delta, trend);
	}

	private Measurement measurement(TrainingCareerSessionView session) {
		double first = session.accuracy();
		double last = session.accuracy();
		try {
			JsonNode windows = objectMapper.readTree(session.analysisSnapshotJson()).path("windows");
			if (windows.isArray() && !windows.isEmpty()) {
				JsonNode firstAccuracy = windows.get(0).get("accuracy");
				JsonNode lastAccuracy = windows.get(windows.size() - 1).get("accuracy");
				if (firstAccuracy != null && firstAccuracy.isNumber()) first = firstAccuracy.asDouble();
				if (lastAccuracy != null && lastAccuracy.isNumber()) last = lastAccuracy.asDouble();
			}
		}
		catch (JacksonException exception) {
			throw new IllegalStateException("stored training analysis snapshot is invalid", exception);
		}
		return new Measurement(session, last, last - first);
	}

	private TrainingAnalysisSnapshot analysisSnapshot(UUID userId,
			List<TrainingCareerCohortAggregateView> aggregates,
			List<TrainingCareerSessionView> recentSessions, int configurationCount,
			int sampleSize, TrainingAnalysisSnapshot.Comparison comparison) {
		List<Measurement> recent = recentSessions.stream().map(this::measurement).toList();
		Map<String, Double> summary = analysisSummary(aggregates, recent, configurationCount, sampleSize);
		List<Measurement> recentChronological = new ArrayList<>(recent);
		Collections.reverse(recentChronological);
		List<TrainingAnalysisSnapshot.Window> windows = new ArrayList<>();
		for (int index = 0; index < recentChronological.size(); index++) {
			Measurement value = recentChronological.get(index);
			TrainingCareerSessionView session = value.session();
			int durationSeconds = Math.max(1, (int) Math.round(session.durationMs() / 1_000d));
			String targetSize = targetSize(session.configurationKey());
			String sessionType = "benchmark".equals(session.sessionType()) ? "standard" : "practice";
			windows.add(new TrainingAnalysisSnapshot.Window(String.format("R%02d|%s|%ds|%s", index + 1,
					sessionType, durationSeconds, targetSize),
					index * 1_000L, (index + 1) * 1_000L,
					analysisNumbers(Map.of("scorePerMinute", scorePerMinute(session), "accuracy", session.accuracy(),
							"targetsPerMinute", session.targetsPerMinute(),
							"averageHitInterval", session.averageHitInterval(),
							"consistencyScore", session.consistencyScore(),
							"maxCombo", (double) session.maxCombo(), "durationSeconds", (double) durationSeconds,
							"targetSizeLevel", targetSizeLevel(targetSize), "lastPhaseAccuracy", value.lastPhaseAccuracy(),
							"phaseAccuracyChange", value.phaseAccuracyChange()))));
		}
		return new TrainingAnalysisSnapshot(TrainingAnalysisSnapshot.CURRENT_SCHEMA_VERSION,
				TrainingAnalysisSnapshot.Scope.CAREER,
				"career:" + userId + ":grid-shot:all-history",
				analysisDataVersion(aggregates, recentSessions), "grid-shot", "grid-shot:all-history",
				sampleSize, summary, windows, signals(summary, recent, comparison), comparison,
				new TrainingAnalysisSnapshot.Integrity(true, List.of()));
	}

	private static Map<String, Double> analysisSummary(List<TrainingCareerCohortAggregateView> aggregates,
			List<Measurement> recent, int configurationCount, int sampleSize) {
		Map<String, Double> result = new LinkedHashMap<>();
		result.put("validSessionCount", (double) sampleSize);
		result.put("standardSessionCount", (double) aggregates.stream()
				.filter(value -> "benchmark".equals(value.sessionType()))
				.mapToLong(TrainingCareerCohortAggregateView::sessionCount).sum());
		result.put("practiceSessionCount", (double) aggregates.stream()
				.filter(value -> "practice".equals(value.sessionType()))
				.mapToLong(TrainingCareerCohortAggregateView::sessionCount).sum());
		result.put("configurationCount", (double) configurationCount);
		result.put("averageScorePerMinute", weightedAverage(aggregates,
				TrainingCareerCohortAggregateView::averageScorePerMinute));
		result.put("bestScorePerMinute", aggregates.stream()
				.mapToDouble(TrainingCareerCohortAggregateView::bestScorePerMinute).max().orElse(0));
		result.put("averageAccuracy", weightedAverage(aggregates,
				TrainingCareerCohortAggregateView::averageAccuracy));
		result.put("averageTargetsPerMinute", weightedAverage(aggregates,
				TrainingCareerCohortAggregateView::averageTargetsPerMinute));
		result.put("averageConsistencyScore", weightedAverage(aggregates,
				TrainingCareerCohortAggregateView::averageConsistencyScore));
		result.put("recentScorePerMinute", average(recent, value -> scorePerMinute(value.session())));
		result.put("recentAccuracy", average(recent, value -> value.session().accuracy()));
		result.put("recentConsistencyScore", average(recent, value -> value.session().consistencyScore()));
		result.replaceAll((key, value) -> analysisNumber(value));
		return result;
	}

	private static List<TrainingAnalysisSnapshot.Signal> signals(Map<String, Double> summary,
			List<Measurement> recent, TrainingAnalysisSnapshot.Comparison comparison) {
		List<TrainingAnalysisSnapshot.Signal> result = new ArrayList<>();
		if (summary.get("averageAccuracy") >= 90 && summary.get("averageConsistencyScore") >= 75) {
			result.add(new TrainingAnalysisSnapshot.Signal("CONTROL_FOUNDATION",
					TrainingAnalysisSnapshot.Severity.POSITIVE,
					Map.of("accuracy", summary.get("averageAccuracy"),
							"consistencyScore", summary.get("averageConsistencyScore"))));
		}
		if (comparison != null) {
			double scoreDelta = comparison.deltas().getOrDefault("scorePerMinuteDeltaPercent", 0d);
			double accuracyDelta = comparison.deltas().getOrDefault("accuracyDelta", 0d);
			double consistencyDelta = comparison.deltas().getOrDefault("consistencyScoreDelta", 0d);
			String code;
			TrainingAnalysisSnapshot.Severity severity;
			if (scoreDelta >= 3 && accuracyDelta >= -1) {
				code = "RECENT_IMPROVEMENT";
				severity = TrainingAnalysisSnapshot.Severity.POSITIVE;
			}
			else if (scoreDelta <= -3 || accuracyDelta <= -2 || consistencyDelta <= -5) {
				code = "RECENT_DECLINE";
				severity = TrainingAnalysisSnapshot.Severity.OPPORTUNITY;
			}
			else {
				code = "RECENT_STABLE";
				severity = TrainingAnalysisSnapshot.Severity.WARNING;
			}
			result.add(new TrainingAnalysisSnapshot.Signal(code, severity,
					Map.of("scorePerMinuteDeltaPercent", scoreDelta,
							"accuracyDelta", accuracyDelta,
							"consistencyScoreDelta", consistencyDelta)));
		}
		if (summary.get("averageAccuracy") < 85) {
			result.add(new TrainingAnalysisSnapshot.Signal("ACCURACY_LIMITS_PACE",
					TrainingAnalysisSnapshot.Severity.OPPORTUNITY,
					Map.of("accuracy", summary.get("averageAccuracy"),
							"targetsPerMinute", summary.get("averageTargetsPerMinute"))));
		}
		if (summary.get("averageConsistencyScore") < 70) {
			result.add(new TrainingAnalysisSnapshot.Signal("RHYTHM_INSTABILITY",
					TrainingAnalysisSnapshot.Severity.OPPORTUNITY,
					Map.of("consistencyScore", summary.get("averageConsistencyScore"))));
		}
		double recentPhaseAccuracyChange = analysisNumber(average(recent, Measurement::phaseAccuracyChange));
		if (recentPhaseAccuracyChange < -3 && result.size() < 5) {
			result.add(new TrainingAnalysisSnapshot.Signal("CLOSING_ACCURACY_DROP",
					TrainingAnalysisSnapshot.Severity.OPPORTUNITY,
					Map.of("lastPhaseAccuracy", analysisNumber(average(recent, Measurement::lastPhaseAccuracy)),
							"phaseAccuracyChange", recentPhaseAccuracyChange)));
		}
		return List.copyOf(result.subList(0, Math.min(5, result.size())));
	}

	private TrainingAnalysisSnapshot.Comparison careerComparison(UUID userId, Map<CohortKey, Long> cohortSizes) {
		List<Map<String, Double>> deltas = new ArrayList<>();
		for (Map.Entry<CohortKey, Long> entry : cohortSizes.entrySet()) {
			if (entry.getValue() < TREND_WINDOW_SIZE * 2L) continue;
			CohortKey cohort = entry.getKey();
			List<Measurement> sessions = repository.findRecentValidCareerSessionsForCohort(
					userId, TRAINING_ID, cohort.configurationKey(), cohort.modeVersion(), cohort.scoringVersion(),
					TrainingSession.IntegrityStatus.VALID,
					PageRequest.of(0, TREND_WINDOW_SIZE * 2)).stream().map(this::measurement).toList();
			if (sessions.size() < TREND_WINDOW_SIZE * 2) continue;
			List<Measurement> recent = sessions.subList(0, TREND_WINDOW_SIZE);
			List<Measurement> previous = sessions.subList(TREND_WINDOW_SIZE, TREND_WINDOW_SIZE * 2);
			double previousScorePerMinute = average(previous, value -> scorePerMinute(value.session()));
			deltas.add(Map.of(
					"scorePerMinuteDeltaPercent", percentDelta(
							average(recent, value -> scorePerMinute(value.session())), previousScorePerMinute),
					"accuracyDelta", average(recent, value -> value.session().accuracy())
							- average(previous, value -> value.session().accuracy()),
					"targetsPerMinuteDelta", average(recent, value -> value.session().targetsPerMinute())
							- average(previous, value -> value.session().targetsPerMinute()),
					"consistencyScoreDelta", average(recent, value -> value.session().consistencyScore())
							- average(previous, value -> value.session().consistencyScore()),
					"lastPhaseAccuracyDelta", average(recent, Measurement::lastPhaseAccuracy)
							- average(previous, Measurement::lastPhaseAccuracy),
					"phaseAccuracyChangeDelta", average(recent, Measurement::phaseAccuracyChange)
							- average(previous, Measurement::phaseAccuracyChange)));
		}
		if (deltas.isEmpty()) return null;
		Map<String, Double> averaged = new LinkedHashMap<>();
		for (String key : deltas.getFirst().keySet()) {
			averaged.put(key, analysisNumber(
					deltas.stream().mapToDouble(value -> value.get(key)).average().orElse(0)));
		}
		return new TrainingAnalysisSnapshot.Comparison(deltas.size() * TREND_WINDOW_SIZE * 2, averaged);
	}

	private static Map<CohortKey, Long> cohortSizes(List<TrainingCareerCohortAggregateView> aggregates) {
		Map<CohortKey, Long> result = new LinkedHashMap<>();
		for (TrainingCareerCohortAggregateView aggregate : aggregates) {
			CohortKey key = new CohortKey(aggregate.configurationKey(), aggregate.modeVersion(),
					aggregate.scoringVersion());
			result.merge(key, aggregate.sessionCount(), Long::sum);
		}
		return result;
	}

	private static double weightedAverage(List<TrainingCareerCohortAggregateView> aggregates,
			ToDoubleFunction<TrainingCareerCohortAggregateView> value) {
		long count = aggregates.stream().mapToLong(TrainingCareerCohortAggregateView::sessionCount).sum();
		if (count == 0) return 0;
		double sum = aggregates.stream()
				.mapToDouble(aggregate -> value.applyAsDouble(aggregate) * aggregate.sessionCount()).sum();
		return sum / count;
	}

	private static double percentDelta(double current, double previous) {
		return previous == 0 ? 0 : (current - previous) * 100d / previous;
	}

	private static Map<String, Double> analysisNumbers(Map<String, Double> values) {
		Map<String, Double> rounded = new LinkedHashMap<>();
		values.forEach((key, value) -> rounded.put(key, analysisNumber(value)));
		return rounded;
	}

	private static double analysisNumber(double value) {
		return Math.round(value * 100d) / 100d;
	}

	private static int boundedInt(long value) {
		return (int) Math.min(Integer.MAX_VALUE, Math.max(0, value));
	}

	private static String analysisDataVersion(List<TrainingCareerCohortAggregateView> aggregates,
			List<TrainingCareerSessionView> recent) {
		String aggregateSource = aggregates.stream()
				.map(value -> value.configurationKey() + ":" + value.modeVersion() + ":"
						+ value.scoringVersion() + ":" + value.sessionType() + ":" + value.sessionCount()
						+ ":" + value.averageScorePerMinute() + ":" + value.averageAccuracy()
						+ ":" + value.averageTargetsPerMinute() + ":" + value.averageConsistencyScore())
				.sorted().collect(java.util.stream.Collectors.joining("|"));
		String recentSource = recent.stream()
				.map(value -> value.id() + ":" + value.analysisDataVersion())
				.collect(java.util.stream.Collectors.joining("|"));
		return sha256("grid-shot:all-history|" + aggregateSource + "|recent|" + recentSource);
	}

	private static String targetSize(String configurationKey) {
		String[] parts = configurationKey.split(":");
		return parts.length == 0 ? "unknown" : parts[parts.length - 1];
	}

	private static double targetSizeLevel(String targetSize) {
		return switch (targetSize) {
			case "small" -> 1d;
			case "medium" -> 2d;
			case "large" -> 3d;
			default -> 0d;
		};
	}

	private static ProfileConfidence confidence(int sampleSize) {
		if (sampleSize == 0) return ProfileConfidence.EMPTY;
		if (sampleSize < 3) return ProfileConfidence.OBSERVING;
		if (sampleSize < 5) return ProfileConfidence.INITIAL;
		if (sampleSize < 10) return ProfileConfidence.DEVELOPING;
		return ProfileConfidence.STABLE;
	}

	private static double average(List<Measurement> sessions, ToDoubleFunction<Measurement> value) {
		return sessions.stream().mapToDouble(value).average().orElse(0);
	}

	private static double scorePerMinute(TrainingCareerSessionView session) {
		return session.durationMs() > 0 ? session.score() * 60_000d / session.durationMs() : 0;
	}

	private static String dataVersion(List<Measurement> sessions) {
		String source = sessions.isEmpty() ? "grid-shot:cohort:empty" : sessions.stream()
				.map(value -> value.session().id() + ":" + value.session().analysisDataVersion())
				.collect(java.util.stream.Collectors.joining("|"));
		return sha256(source);
	}

	private static String sha256(String source) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
					.digest(source.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException("SHA-256 unavailable", exception);
		}
	}

	enum ProfileConfidence { EMPTY, OBSERVING, INITIAL, DEVELOPING, STABLE }
	enum Direction { HIGHER_IS_BETTER, LOWER_IS_BETTER }
	enum TrendStatus { INSUFFICIENT, IMPROVING, STABLE, DECLINING }

	record CohortDefinition(String configurationKey, int modeVersion, int scoringVersion) implements Serializable { }
	record SampleSummary(int totalSessions, int validSessions, int comparableSessions,
			int configurationCount, ProfileConfidence confidence) implements Serializable { }
	record Coverage(int availableDimensions, int totalDimensions, List<String> capabilityCodes)
			implements Serializable { }
	record MetricProfile(String code, String unit, Direction direction, Double current,
			Double lifetimeAverage, Double best, Double delta, TrendStatus trend) implements Serializable { }
	record DimensionProfile(String code, String primaryMetric, TrendStatus trend,
			List<MetricProfile> metrics) implements Serializable { }
	record ProfileView(int schemaVersion, String profileVersion, String dataVersion, String trainingId,
			CohortDefinition cohort, SampleSummary sample, Coverage coverage,
			List<DimensionProfile> dimensions, List<UUID> recentSessionIds,
			Instant updatedAt, Instant generatedAt) implements Serializable {

		MetricProfile metric(String code) {
			return dimensions.stream().flatMap(dimension -> dimension.metrics().stream())
					.filter(metric -> metric.code().equals(code)).findFirst()
					.orElseThrow(() -> new IllegalStateException("missing career metric " + code));
		}
	}

	private record Measurement(TrainingCareerSessionView session, double lastPhaseAccuracy,
			double phaseAccuracyChange) { }
	private record CohortKey(String configurationKey, int modeVersion, int scoringVersion) { }
	private record Projection(ProfileView profile, List<Measurement> comparable) { }
}
