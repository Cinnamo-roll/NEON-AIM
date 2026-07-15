package com.neonaim.training;

import com.neonaim.common.error.ApiException;
import com.neonaim.training.api.TrainingAnalysisSnapshot;
import com.neonaim.training.api.TrainingCareerAnalysisOperations.CareerContext;
import com.neonaim.training.api.TrainingCareerAnalysisOperations.Confidence;
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
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
class TrainingCareerProfileService implements TrainingCareerProfileStrategy {

	static final int PROFILE_SCHEMA_VERSION = 1;
	static final String TRAINING_ID = "grid-shot";
	static final String PROFILE_VERSION = "grid-shot-career-profile-v2";
	private static final int MIN_COMPARABLE_SAMPLE = 3;
	private static final int MAX_PROFILE_SESSIONS = 500;
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
		Projection projection = projection(userId);
		List<Measurement> comparable = projection.comparable();
		if (comparable.size() < MIN_COMPARABLE_SAMPLE) {
			throw new ApiException(HttpStatus.CONFLICT, "CAREER_COMPARABLE_SAMPLE_TOO_SMALL",
					"至少需要 3 局相同配置的有效训练记录后再生成综合分析");
		}
		ProfileView profile = projection.profile();
		TrainingAnalysisSnapshot snapshot = analysisSnapshot(userId, profile, comparable);
		Confidence confidence = comparable.size() >= 10 ? Confidence.STABLE
				: comparable.size() >= 5 ? Confidence.LOW : Confidence.INITIAL;
		return new CareerContext(comparable.getFirst().session().id(), snapshot, confidence,
				comparable.size(), comparable.size(), 1);
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
		List<TrainingSession> sessions = repository
				.findByUserIdAndTrainingIdOrderByCompletedAtDesc(userId, TRAINING_ID,
						PageRequest.of(0, MAX_PROFILE_SESSIONS))
				.getContent();
		List<TrainingSession> valid = sessions.stream()
				.filter(session -> session.integrityStatus() == TrainingSession.IntegrityStatus.VALID)
				.toList();
		Map<CohortKey, List<TrainingSession>> cohorts = new LinkedHashMap<>();
		for (TrainingSession session : valid) {
			CohortKey key = new CohortKey(session.configurationKey(), session.modeVersion(), session.scoringVersion());
			cohorts.computeIfAbsent(key, ignored -> new ArrayList<>()).add(session);
		}
		List<TrainingSession> selected = List.of();
		for (List<TrainingSession> cohort : cohorts.values()) {
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

	private Measurement measurement(TrainingSession session) {
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

	private TrainingAnalysisSnapshot analysisSnapshot(UUID userId, ProfileView profile,
			List<Measurement> comparable) {
		Map<String, Double> summary = analysisSummary(profile, comparable);
		List<Measurement> recentChronological = new ArrayList<>(comparable.subList(0, Math.min(6, comparable.size())));
		Collections.reverse(recentChronological);
		List<TrainingAnalysisSnapshot.Window> windows = new ArrayList<>();
		for (int index = 0; index < recentChronological.size(); index++) {
			Measurement value = recentChronological.get(index);
			TrainingSession session = value.session();
			int durationSeconds = Math.max(1, (int) Math.round(session.durationMs() / 1_000d));
			String targetSize = targetSize(session.configurationKey());
			windows.add(new TrainingAnalysisSnapshot.Window(String.format("S%02d|%ds|%s", index + 1,
					durationSeconds, targetSize),
					index * 1_000L, (index + 1) * 1_000L,
					Map.of("scorePerMinute", scorePerMinute(session), "accuracy", session.accuracy(),
							"targetsPerMinute", session.targetsPerMinute(),
							"averageHitInterval", session.averageHitInterval(),
							"consistencyScore", session.consistencyScore(),
							"maxCombo", (double) session.maxCombo(), "durationSeconds", (double) durationSeconds,
							"targetSizeLevel", targetSizeLevel(targetSize), "lastPhaseAccuracy", value.lastPhaseAccuracy(),
							"phaseAccuracyChange", value.phaseAccuracyChange())));
		}
		TrainingAnalysisSnapshot.Comparison comparison = comparable.size() >= 6
				? comparison(comparable) : null;
		TrainingSession source = comparable.getFirst().session();
		return new TrainingAnalysisSnapshot(TrainingAnalysisSnapshot.CURRENT_SCHEMA_VERSION,
				TrainingAnalysisSnapshot.Scope.CAREER,
				"career:" + userId + ":grid-shot:cohort:" + source.configurationKey()
						+ ":" + source.modeVersion() + ":" + source.scoringVersion(),
				profile.dataVersion(), "grid-shot", source.configurationKey(),
				comparable.size(), summary, windows, signals(summary, comparable.size()), comparison,
				new TrainingAnalysisSnapshot.Integrity(true, List.of()));
	}

	private static Map<String, Double> analysisSummary(ProfileView profile, List<Measurement> sessions) {
		Map<String, Double> result = new LinkedHashMap<>();
		result.put("comparableSampleSize", (double) sessions.size());
		result.put("averageScorePerMinute", average(sessions, value -> scorePerMinute(value.session())));
		result.put("bestScorePerMinute", sessions.stream().mapToDouble(value -> scorePerMinute(value.session())).max().orElse(0));
		result.put("averageAccuracy", profile.metric("accuracy").lifetimeAverage());
		result.put("averageTargetsPerMinute", profile.metric("targetsPerMinute").lifetimeAverage());
		result.put("averageHitInterval", profile.metric("averageHitInterval").lifetimeAverage());
		result.put("averageConsistencyScore", profile.metric("consistencyScore").lifetimeAverage());
		result.put("recentAccuracy", profile.metric("accuracy").current());
		result.put("recentTargetsPerMinute", profile.metric("targetsPerMinute").current());
		result.put("recentConsistencyScore", profile.metric("consistencyScore").current());
		result.put("recentLastPhaseAccuracy", profile.metric("lastPhaseAccuracy").current());
		result.put("recentPhaseAccuracyChange", profile.metric("phaseAccuracyChange").current());
		return result;
	}

	private static List<TrainingAnalysisSnapshot.Signal> signals(Map<String, Double> summary, int sampleSize) {
		List<TrainingAnalysisSnapshot.Signal> result = new ArrayList<>();
		if (summary.get("averageAccuracy") >= 90 && summary.get("averageConsistencyScore") >= 75) {
			result.add(new TrainingAnalysisSnapshot.Signal("CONTROL_FOUNDATION",
					TrainingAnalysisSnapshot.Severity.POSITIVE,
					Map.of("accuracy", summary.get("averageAccuracy"),
							"consistencyScore", summary.get("averageConsistencyScore"))));
		}
		if (sampleSize < 5) {
			result.add(new TrainingAnalysisSnapshot.Signal("LOW_SAMPLE",
					TrainingAnalysisSnapshot.Severity.WARNING, Map.of("sampleSize", (double) sampleSize)));
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
					Map.of("consistencyScore", summary.get("averageConsistencyScore"),
							"averageHitInterval", summary.get("averageHitInterval"))));
		}
		if (summary.get("recentPhaseAccuracyChange") < -3) {
			result.add(new TrainingAnalysisSnapshot.Signal("CLOSING_ACCURACY_DROP",
					TrainingAnalysisSnapshot.Severity.OPPORTUNITY,
					Map.of("lastPhaseAccuracy", summary.get("recentLastPhaseAccuracy"),
							"phaseAccuracyChange", summary.get("recentPhaseAccuracyChange"))));
		}
		return List.copyOf(result);
	}

	private static TrainingAnalysisSnapshot.Comparison comparison(List<Measurement> sessions) {
		List<Measurement> recent = sessions.subList(0, 3);
		List<Measurement> previous = sessions.subList(3, 6);
		return new TrainingAnalysisSnapshot.Comparison(6, Map.of(
				"scorePerMinuteDelta", average(recent, value -> scorePerMinute(value.session()))
						- average(previous, value -> scorePerMinute(value.session())),
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

	private static double scorePerMinute(TrainingSession session) {
		return session.durationMs() > 0 ? session.score() * 60_000d / session.durationMs() : 0;
	}

	private static String dataVersion(List<Measurement> sessions) {
		String source = sessions.isEmpty() ? "grid-shot:cohort:empty" : sessions.stream()
				.map(value -> value.session().id() + ":" + value.session().analysisDataVersion())
				.collect(java.util.stream.Collectors.joining("|"));
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

	record CohortDefinition(String configurationKey, int modeVersion, int scoringVersion) { }
	record SampleSummary(int totalSessions, int validSessions, int comparableSessions,
			int configurationCount, ProfileConfidence confidence) { }
	record Coverage(int availableDimensions, int totalDimensions, List<String> capabilityCodes) { }
	record MetricProfile(String code, String unit, Direction direction, Double current,
			Double lifetimeAverage, Double best, Double delta, TrendStatus trend) { }
	record DimensionProfile(String code, String primaryMetric, TrendStatus trend,
			List<MetricProfile> metrics) { }
	record ProfileView(int schemaVersion, String profileVersion, String dataVersion, String trainingId,
			CohortDefinition cohort, SampleSummary sample, Coverage coverage,
			List<DimensionProfile> dimensions, List<UUID> recentSessionIds,
			Instant updatedAt, Instant generatedAt) {

		MetricProfile metric(String code) {
			return dimensions.stream().flatMap(dimension -> dimension.metrics().stream())
					.filter(metric -> metric.code().equals(code)).findFirst()
					.orElseThrow(() -> new IllegalStateException("missing career metric " + code));
		}
	}

	private record Measurement(TrainingSession session, double lastPhaseAccuracy,
			double phaseAccuracyChange) { }
	private record CohortKey(String configurationKey, int modeVersion, int scoringVersion) { }
	private record Projection(ProfileView profile, List<Measurement> comparable) { }
}
