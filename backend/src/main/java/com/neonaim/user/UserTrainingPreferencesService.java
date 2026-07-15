package com.neonaim.user;

import com.neonaim.common.error.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
class UserTrainingPreferencesService {

	private static final int MAX_PREFERENCES_JSON_LENGTH = 32_768;
	private static final int CURRENT_SCHEMA_VERSION = 1;

	private final UserTrainingPreferencesRepository repository;
	private final UserAccountRepository accounts;
	private final ObjectMapper objectMapper;
	private final Clock clock;

	UserTrainingPreferencesService(
			UserTrainingPreferencesRepository repository,
			UserAccountRepository accounts,
			ObjectMapper objectMapper,
			Clock clock) {
		this.repository = repository;
		this.accounts = accounts;
		this.objectMapper = objectMapper;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	PreferencesView current(UUID userId) {
		ensureActiveUser(userId);
		return repository.findById(userId)
				.map(this::view)
				.orElseGet(PreferencesView::notConfigured);
	}

	@Transactional
	PreferencesView save(UUID userId, JsonNode preferences) {
		ensureActiveUser(userId);
		String storedJson = validateAndSerialize(preferences);
		Instant now = clock.instant();
		UserTrainingPreferences stored = repository.findById(userId)
				.orElseGet(() -> new UserTrainingPreferences(userId, storedJson, now));
		stored.update(storedJson, now);
		return view(repository.save(stored));
	}

	private String validateAndSerialize(JsonNode preferences) {
		if (preferences == null || !preferences.isObject()) {
			throw invalid("PREFERENCES_INVALID", "设置内容必须是 JSON 对象");
		}
		JsonNode schemaVersion = preferences.get("schemaVersion");
		if (schemaVersion == null || !schemaVersion.canConvertToInt()
				|| schemaVersion.intValue() != CURRENT_SCHEMA_VERSION) {
			throw invalid("PREFERENCES_SCHEMA_UNSUPPORTED", "设置版本不受支持，请刷新页面后重试");
		}
		try {
			String serialized = objectMapper.writeValueAsString(preferences);
			if (serialized.length() > MAX_PREFERENCES_JSON_LENGTH) {
				throw invalid("PREFERENCES_TOO_LARGE", "设置内容超出允许大小");
			}
			return serialized;
		}
		catch (JacksonException exception) {
			throw invalid("PREFERENCES_INVALID", "设置内容无法保存");
		}
	}

	private PreferencesView view(UserTrainingPreferences preferences) {
		try {
			return new PreferencesView(true, objectMapper.readTree(preferences.preferencesJson()), preferences.updatedAt());
		}
		catch (JacksonException exception) {
			throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "PREFERENCES_CORRUPTED", "账号设置暂时无法读取");
		}
	}

	private void ensureActiveUser(UUID userId) {
		UserAccount account = accounts.findById(userId)
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "用户不存在"));
		if (account.status() != UserAccount.Status.ACTIVE) {
			throw new ApiException(HttpStatus.UNAUTHORIZED, "ACCOUNT_INACTIVE", "账户当前不可用");
		}
	}

	private static ApiException invalid(String code, String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, code, message);
	}

	record PreferencesView(boolean configured, JsonNode preferences, Instant updatedAt) {
		static PreferencesView notConfigured() {
			return new PreferencesView(false, null, null);
		}
	}
}
