package com.neonaim.ai;

import com.neonaim.common.error.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class AiProviderSettingsService {

	private static final int SETTINGS_ID = 1;

	private final AiProviderSettingsRepository repository;
	private final AiSecretCipher cipher;
	private final Clock clock;

	AiProviderSettingsService(AiProviderSettingsRepository repository, AiSecretCipher cipher, Clock clock) {
		this.repository = repository;
		this.cipher = cipher;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	SettingsView current() {
		return repository.findById(SETTINGS_ID).map(this::view).orElseGet(SettingsView::notConfigured);
	}

	@Transactional
	SettingsView save(String provider, String apiKey, String model) {
		String normalizedProvider = provider.trim().toLowerCase(Locale.ROOT);
		String normalizedModel = model.trim();
		AiProviderSettings settings = repository.findById(SETTINGS_ID).orElse(null);
		String ciphertext;
		if (apiKey != null && !apiKey.isBlank()) {
			ciphertext = cipher.encrypt(apiKey.trim());
		}
		else if (settings != null && settings.provider().equals(normalizedProvider)) {
			ciphertext = settings.apiKeyCiphertext();
		}
		else {
			throw new ApiException(HttpStatus.BAD_REQUEST, "AI_API_KEY_REQUIRED",
					"首次配置或切换模型服务时必须填写 API Key");
		}
		Instant now = clock.instant();
		if (settings == null) {
			settings = new AiProviderSettings(normalizedProvider, ciphertext, normalizedModel, now);
		}
		else {
			settings.update(normalizedProvider, ciphertext, normalizedModel, now);
		}
		return view(repository.save(settings));
	}

	@Transactional(readOnly = true)
	Credentials requireCredentials() {
		AiProviderSettings settings = repository.findById(SETTINGS_ID).orElseThrow(() ->
				new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_PROVIDER_NOT_CONFIGURED",
						"AI 分析服务尚未配置，请联系管理员"));
		return new Credentials(settings.provider(), cipher.decrypt(settings.apiKeyCiphertext()), settings.model());
	}

	@Transactional(readOnly = true)
	Credentials resolveForTest(String provider, String apiKey, String model) {
		String normalizedProvider = provider.trim().toLowerCase(Locale.ROOT);
		String normalizedModel = model.trim();
		if (apiKey != null && !apiKey.isBlank()) {
			return new Credentials(normalizedProvider, apiKey.trim(), normalizedModel);
		}
		AiProviderSettings settings = repository.findById(SETTINGS_ID).orElseThrow(() ->
				new ApiException(HttpStatus.BAD_REQUEST, "AI_API_KEY_REQUIRED",
						"当前没有已保存的密钥，请先填写 API Key"));
		if (!settings.provider().equals(normalizedProvider)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "AI_API_KEY_REQUIRED",
					"切换模型服务时必须填写对应的 API Key");
		}
		return new Credentials(normalizedProvider, cipher.decrypt(settings.apiKeyCiphertext()), normalizedModel);
	}

	private SettingsView view(AiProviderSettings settings) {
		String apiKey = cipher.decrypt(settings.apiKeyCiphertext());
		String suffix = apiKey.length() <= 4 ? apiKey : apiKey.substring(apiKey.length() - 4);
		return new SettingsView(true, settings.provider(), settings.model(), "••••" + suffix, settings.updatedAt());
	}

	record Credentials(String provider, String apiKey, String model) {
	}

	record SettingsView(boolean configured, String provider, String model, String apiKeyHint, Instant updatedAt) {
		static SettingsView notConfigured() {
			return new SettingsView(false, null, null, null, null);
		}
	}
}
