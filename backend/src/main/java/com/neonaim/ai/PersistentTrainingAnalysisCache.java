package com.neonaim.ai;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.util.HexFormat;
import java.util.Optional;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Component
class PersistentTrainingAnalysisCache implements TrainingAnalysisCache {

	private final TrainingAiAnalysisCacheRepository repository;
	private final ObjectMapper objectMapper;
	private final Clock clock;

	PersistentTrainingAnalysisCache(TrainingAiAnalysisCacheRepository repository,
			ObjectMapper objectMapper, Clock clock) {
		this.repository = repository;
		this.objectMapper = objectMapper;
		this.clock = clock;
	}

	@Override
	public Optional<TrainingAnalysisProvider.AnalysisResult> find(CacheKey key) {
		return repository.findById(hash(key)).map(entry -> read(entry.resultJson()));
	}

	@Override
	public void put(CacheKey key, TrainingAnalysisProvider.AnalysisResult result) {
		try {
			repository.saveAndFlush(new TrainingAiAnalysisCacheEntry(hash(key), key,
					objectMapper.writeValueAsString(result), clock.instant()));
		}
		catch (DataIntegrityViolationException ignored) {
			// A concurrent identical request populated the same immutable cache entry.
		}
		catch (JacksonException exception) {
			throw new IllegalStateException("AI analysis cache serialization failed", exception);
		}
	}

	private TrainingAnalysisProvider.AnalysisResult read(String value) {
		try {
			return objectMapper.readValue(value, TrainingAnalysisProvider.AnalysisResult.class);
		}
		catch (JacksonException exception) {
			throw new IllegalStateException("stored AI analysis cache is invalid", exception);
		}
	}

	private static String hash(CacheKey key) {
		String value = String.join("\u001f", key.scope().name(), key.sourceId(), key.dataVersion(),
				key.promptVersion(), key.providerId());
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest);
		}
		catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException("SHA-256 is unavailable", exception);
		}
	}
}
