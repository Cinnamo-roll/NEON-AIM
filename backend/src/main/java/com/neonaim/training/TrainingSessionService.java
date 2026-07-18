package com.neonaim.training;

import com.neonaim.common.error.ApiException;
import com.neonaim.training.api.TrainingAnalysisResult;
import com.neonaim.training.api.TrainingAnalysisSnapshot;
import com.neonaim.training.api.TrainingCoachingTaskOperations;
import com.neonaim.training.api.TrainingSessionAnalysisOperations;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
class TrainingSessionService implements TrainingSessionAnalysisOperations {

	private static final Logger LOGGER = LoggerFactory.getLogger(TrainingSessionService.class);

	private static final int MAX_DETAIL_CHARACTERS = 350_000;
	private static final int MAX_ANALYSIS_CHARACTERS = 12_000;
	private static final int RECENT_COMPARISON_LIMIT = 5;
	private final TrainingSessionRepository repository;
	private final TrainingSessionAnalysisRepository analysisRepository;
	private final TrainingSessionWriter writer;
	private final TrainingRuleAnalysisEngine ruleAnalysisEngine;
	private final TrainingSessionValidationEngine validationEngine;
	private final TrainingCoachingTaskOperations coachingTaskOperations;
	private final ObjectMapper objectMapper;
	private final Clock clock;

	TrainingSessionService(TrainingSessionRepository repository,
			TrainingSessionAnalysisRepository analysisRepository, TrainingSessionWriter writer,
			TrainingRuleAnalysisEngine ruleAnalysisEngine, TrainingSessionValidationEngine validationEngine,
			TrainingCoachingTaskOperations coachingTaskOperations,
			ObjectMapper objectMapper, Clock clock) {
		this.repository = repository;
		this.analysisRepository = analysisRepository;
		this.writer = writer;
		this.ruleAnalysisEngine = ruleAnalysisEngine;
		this.validationEngine = validationEngine;
		this.coachingTaskOperations = coachingTaskOperations;
		this.objectMapper = objectMapper;
		this.clock = clock;
	}

	@CacheEvict(cacheNames = TrainingCareerProfileService.CACHE_NAME,
			key = "#userId.toString() + ':' + #submission.trainingId()")
	public CreateResult create(UUID userId, TrainingSessionSubmission submission) {
		TrainingSession existing = repository.findByUserIdAndClientSessionId(userId, submission.clientSessionId())
				.orElse(null);
		if (existing != null) {
			return new CreateResult(detail(existing), false);
		}
		validateSubmission(submission);
		String configurationJson = writeJson(submission.configuration());
		String detailJson = writeJson(submission.detail());
		String analysisJson = writeJson(submission.analysisSnapshot());
		String integrityErrorsJson = writeJson(objectMapper.valueToTree(submission.integrity().errors()));
		if (detailJson.length() > MAX_DETAIL_CHARACTERS) {
			throw invalid("TRAINING_DETAIL_TOO_LARGE", "训练详情数据过大");
		}
		if (analysisJson.length() > MAX_ANALYSIS_CHARACTERS) {
			throw invalid("TRAINING_ANALYSIS_TOO_LARGE", "训练分析快照过大");
		}
		String dataVersion = sha256(analysisJson);
		TrainingSession.StoredJson storedJson = new TrainingSession.StoredJson(configurationJson, detailJson,
				analysisJson, integrityErrorsJson, dataVersion);
		TrainingSession candidate = new TrainingSession(userId, submission, storedJson, clock.instant());
		TrainingRuleAnalysisContext analysisContext = new TrainingRuleAnalysisContext(submission.clientSessionId(),
				dataVersion, submission.summary(), submission.analysisSnapshot(), submission.integrity().passed());
		TrainingAnalysisResult ruleAnalysis = ruleAnalysisEngine.analyze(submission.trainingId(), analysisContext);
		TrainingSessionAnalysis storedAnalysis = new TrainingSessionAnalysis(candidate.id(), ruleAnalysis,
				writeJson(ruleAnalysis));
		try {
			TrainingSession saved = writer.insert(candidate, storedAnalysis);
			evaluateCoachingTask(saved, submission);
			return new CreateResult(detail(saved), true);
		}
		catch (DataIntegrityViolationException exception) {
			TrainingSession concurrent = repository.findByUserIdAndClientSessionId(userId, submission.clientSessionId())
					.orElseThrow(() -> exception);
			return new CreateResult(detail(concurrent), false);
		}
	}

	private void evaluateCoachingTask(TrainingSession session, TrainingSessionSubmission submission) {
		if (!"benchmark".equals(session.sessionType())) return;
		Map<String, Double> metrics = validationEngine.coachingMetrics(submission);
		if (metrics.isEmpty()) return;
		try {
			coachingTaskOperations.evaluateCompletedSession(new TrainingCoachingTaskOperations.CompletedSession(
					session.userId(), session.id(), session.trainingId(), session.modeVersion(),
					session.scoringVersion(), session.configurationKey(), session.startedAt(),
					session.completedAt(), session.integrityStatus() == TrainingSession.IntegrityStatus.VALID,
					metrics));
		}
		catch (RuntimeException exception) {
			LOGGER.error("Coaching task evaluation failed for session {}", session.id(), exception);
		}
	}

	@Transactional(readOnly = true)
	SessionPage list(UUID userId, String trainingId, int page, int size) {
		PageRequest pageable = PageRequest.of(page, size);
		Page<TrainingSessionSummaryView> result = trainingId == null || trainingId.isBlank()
				? repository.findSummariesByUserId(userId, pageable)
				: repository.findSummariesByUserIdAndTrainingId(userId, trainingId, pageable);
		return new SessionPage(result.getContent().stream().map(this::summary).toList(), result.getNumber(),
				result.getSize(), result.getTotalElements(), result.getTotalPages());
	}

	@Transactional(readOnly = true)
	SessionDetail detail(UUID userId, UUID sessionId) {
		TrainingSession session = repository.findByIdAndUserId(sessionId, userId)
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TRAINING_SESSION_NOT_FOUND", "训练记录不存在"));
		return detail(session);
	}

	@Transactional(readOnly = true)
	TrainingAnalysisResult analysis(UUID userId, UUID sessionId) {
		if (!repository.existsByIdAndUserId(sessionId, userId)) {
			throw new ApiException(HttpStatus.NOT_FOUND, "TRAINING_SESSION_NOT_FOUND", "训练记录不存在");
		}
		TrainingSessionAnalysis analysis = analysisRepository.findById(sessionId)
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TRAINING_ANALYSIS_NOT_FOUND", "训练分析尚未生成"));
		return readAnalysis(analysis.resultJson());
	}

	@Override
	@Transactional(readOnly = true)
	public AnalysisContext loadAnalysisContext(UUID userId, UUID sessionId) {
		TrainingSession session = repository.findByIdAndUserId(sessionId, userId)
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TRAINING_SESSION_NOT_FOUND",
						"训练记录不存在"));
		TrainingSessionAnalysis storedAnalysis = analysisRepository.findById(sessionId)
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TRAINING_ANALYSIS_NOT_FOUND",
						"训练分析尚未生成"));
		return new AnalysisContext(sessionId, toAnalysisSnapshot(session), readAnalysis(storedAnalysis.resultJson()));
	}

	@Override
	@Transactional
	public void applyAiAnalysis(UUID userId, UUID sessionId, TrainingAnalysisResult result) {
		if (result.source() != TrainingAnalysisResult.Source.AI
				|| result.status() != TrainingAnalysisResult.Status.READY) {
			throw new IllegalArgumentException("only ready AI analysis can replace the current result");
		}
		if (!repository.existsByIdAndUserId(sessionId, userId)) {
			throw new ApiException(HttpStatus.NOT_FOUND, "TRAINING_SESSION_NOT_FOUND", "训练记录不存在");
		}
		TrainingSessionAnalysis storedAnalysis = analysisRepository.findById(sessionId)
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TRAINING_ANALYSIS_NOT_FOUND",
						"训练分析尚未生成"));
		storedAnalysis.update(result, writeJson(result));
	}

	private TrainingAnalysisSnapshot toAnalysisSnapshot(TrainingSession session) {
		JsonNode raw = readJson(session.analysisSnapshotJson());
		JsonNode summary = raw.path("summary");
		List<TrainingAnalysisSnapshot.Window> windows = new java.util.ArrayList<>();
		for (JsonNode window : raw.path("windows")) {
			windows.add(new TrainingAnalysisSnapshot.Window(window.path("label").asString(),
					window.path("startMs").asLong(), window.path("endMs").asLong(),
					metrics(window, "hits", "misses", "accuracy", "targetsPerMinute",
							"averageHitInterval", "medianHitInterval", "averageTargetLifetime",
							"consistencyScore", "maxCombo", "score")));
		}
		List<TrainingAnalysisSnapshot.Signal> signals = new java.util.ArrayList<>();
		for (JsonNode signal : raw.path("signals")) {
			signals.add(new TrainingAnalysisSnapshot.Signal(signal.path("code").asString(),
					TrainingAnalysisSnapshot.Severity.valueOf(signal.path("severity").asString().toUpperCase()),
					numericFieldsExcept(signal.path("evidence"), "targetAccuracy", "targetConsistency")));
		}
		TrainingAnalysisSnapshot.Comparison comparison = recentComparison(session);
		if (comparison == null) {
			JsonNode comparisonNode = raw.path("comparison");
			comparison = comparisonNode.isObject()
					? new TrainingAnalysisSnapshot.Comparison(comparisonNode.path("sampleSize").asInt(),
							numericFieldsExcept(comparisonNode, "sampleSize"))
					: null;
		}
		JsonNode integrity = raw.path("integrity");
		List<String> integrityErrors = new java.util.ArrayList<>();
		for (JsonNode error : integrity.path("errors")) {
			integrityErrors.add(error.asString());
		}
		return new TrainingAnalysisSnapshot(TrainingAnalysisSnapshot.CURRENT_SCHEMA_VERSION,
				TrainingAnalysisSnapshot.Scope.SESSION, session.id().toString(), session.analysisDataVersion(),
				session.trainingId(), session.configurationKey(), session.hits() + session.misses(),
				metrics(summary, "score", "hits", "misses", "accuracy", "targetsPerMinute",
						"averageHitInterval", "medianHitInterval", "fastestHitInterval",
						"slowestHitInterval", "averageTargetLifetime", "consistencyScore", "maxCombo"),
				windows, signals, comparison, new TrainingAnalysisSnapshot.Integrity(
						integrity.path("passed").asBoolean(), integrityErrors));
	}

	private TrainingAnalysisSnapshot.Comparison recentComparison(TrainingSession session) {
		List<TrainingSession> recent = repository
				.findByUserIdAndTrainingIdAndConfigurationKeyAndModeVersionAndScoringVersionAndIntegrityStatusAndCompletedAtLessThanEqualOrderByCompletedAtDesc(
						session.userId(), session.trainingId(), session.configurationKey(), session.modeVersion(),
						session.scoringVersion(), TrainingSession.IntegrityStatus.VALID, session.completedAt(),
						PageRequest.of(0, RECENT_COMPARISON_LIMIT + 1))
				.getContent().stream()
				.filter(candidate -> !candidate.id().equals(session.id()))
				.limit(RECENT_COMPARISON_LIMIT)
				.toList();
		if (recent.isEmpty()) return null;

		Map<String, Double> deltas = new LinkedHashMap<>();
		deltas.put("scoreDeltaPercent", percentDelta(session.score(), average(recent, TrainingSession::score)));
		deltas.put("accuracyDelta", round(session.accuracy() - average(recent, TrainingSession::accuracy)));
		deltas.put("targetsPerMinuteDelta",
				round(session.targetsPerMinute() - average(recent, TrainingSession::targetsPerMinute)));
		deltas.put("averageHitIntervalDelta",
				round(session.averageHitInterval() - average(recent, TrainingSession::averageHitInterval)));
		deltas.put("consistencyScoreDelta",
				round(session.consistencyScore() - average(recent, TrainingSession::consistencyScore)));
		deltas.put("maxComboDelta", round(session.maxCombo() - average(recent, item -> item.maxCombo())));
		return new TrainingAnalysisSnapshot.Comparison(recent.size(), deltas);
	}

	private static double average(List<TrainingSession> sessions,
			java.util.function.ToDoubleFunction<TrainingSession> metric) {
		return sessions.stream().mapToDouble(metric).average().orElse(0d);
	}

	private static double percentDelta(double current, double baseline) {
		return baseline == 0d ? 0d : round((current - baseline) * 100d / baseline);
	}

	private static double round(double value) {
		return Math.round(value * 10d) / 10d;
	}

	private static java.util.Map<String, Double> metrics(JsonNode node, String... names) {
		java.util.Map<String, Double> result = new java.util.LinkedHashMap<>();
		for (String name : names) {
			JsonNode value = node.get(name);
			if (value != null && value.isNumber()) {
				result.put(name, value.asDouble());
			}
		}
		return result;
	}

	private static java.util.Map<String, Double> numericFields(JsonNode node) {
		return numericFieldsExcept(node);
	}

	private static java.util.Map<String, Double> numericFieldsExcept(JsonNode node, String... excludedNames) {
		java.util.Set<String> excluded = java.util.Set.of(excludedNames);
		java.util.Map<String, Double> result = new java.util.LinkedHashMap<>();
		node.properties().forEach(entry -> {
			if (!excluded.contains(entry.getKey()) && entry.getValue().isNumber()) {
				result.put(entry.getKey(), entry.getValue().asDouble());
			}
		});
		return result;
	}

	private void validateSubmission(TrainingSessionSubmission submission) {
		if (submission.completedAt().isBefore(submission.startedAt())) {
			throw invalid("TRAINING_TIME_INVALID", "训练开始和结束时间无效");
		}
		if (!submission.configuration().isObject() || !submission.detail().isObject()
				|| !submission.analysisSnapshot().isObject()) {
			throw invalid("TRAINING_PAYLOAD_INVALID", "训练数据结构无效");
		}
		validationEngine.validate(submission);
	}

	private SessionSummary summary(TrainingSession session) {
		return new SessionSummary(session.id(), session.clientSessionId(), session.trainingId(), session.modeVersion(),
				session.scoringVersion(), session.configurationKey(), session.sessionType(), session.startedAt(), session.completedAt(),
				session.durationMs(), session.score(), session.hits(), session.misses(), session.accuracy(),
				session.targetsPerMinute(), session.averageHitInterval(), session.consistencyScore(),
				session.maxCombo(), session.grade(), session.integrityStatus().name(), session.analysisDataVersion());
	}

	private SessionSummary summary(TrainingSessionSummaryView session) {
		return new SessionSummary(session.id(), session.clientSessionId(), session.trainingId(), session.modeVersion(),
				session.scoringVersion(), session.configurationKey(), session.sessionType(), session.startedAt(),
				session.completedAt(), session.durationMs(), session.score(), session.hits(), session.misses(),
				session.accuracy(), session.targetsPerMinute(), session.averageHitInterval(),
				session.consistencyScore(), session.maxCombo(), session.grade(), session.integrityStatus().name(),
				session.analysisDataVersion());
	}

	private SessionDetail detail(TrainingSession session) {
		TrainingAnalysisResult analysis = analysisRepository.findById(session.id())
				.map(stored -> readAnalysis(stored.resultJson()))
				.orElse(null);
		return new SessionDetail(summary(session), readJson(session.configurationJson()), readJson(session.detailJson()),
				readJson(session.analysisSnapshotJson()), analysis, readJson(session.integrityErrorsJson()), session.createdAt());
	}

	private String writeJson(Object value) {
		try {
			return objectMapper.writeValueAsString(value);
		}
		catch (JacksonException exception) {
			throw invalid("TRAINING_SERIALIZATION_FAILED", "训练数据无法保存");
		}
	}

	private JsonNode readJson(String value) {
		try {
			return objectMapper.readTree(value);
		}
		catch (JacksonException exception) {
			throw new IllegalStateException("stored training JSON is invalid", exception);
		}
	}

	private TrainingAnalysisResult readAnalysis(String value) {
		try {
			return objectMapper.readValue(value, TrainingAnalysisResult.class);
		}
		catch (JacksonException exception) {
			throw new IllegalStateException("stored training analysis JSON is invalid", exception);
		}
	}

	private static String sha256(String value) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest);
		}
		catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException("SHA-256 is unavailable", exception);
		}
	}

	private static ApiException invalid(String code, String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, code, message);
	}

	record CreateResult(SessionDetail session, boolean created) {
	}

	record SessionSummary(UUID id, String clientSessionId, String trainingId, int modeVersion, int scoringVersion,
			String configurationKey, String sessionType, Instant startedAt, Instant completedAt, long durationMs, double score, int hits,
			int misses, double accuracy, double targetsPerMinute, double averageHitInterval, double consistencyScore,
			int maxCombo, String grade, String integrityStatus, String analysisDataVersion) {
	}

	record SessionDetail(SessionSummary summary, JsonNode configuration, JsonNode detail, JsonNode analysisSnapshot,
			TrainingAnalysisResult analysis, JsonNode integrityErrors, Instant storedAt) {
	}

	record SessionPage(List<SessionSummary> items, int page, int size, long totalElements, int totalPages) {
	}
}
