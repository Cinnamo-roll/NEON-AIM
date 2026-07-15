package com.neonaim.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.neonaim.common.error.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class AiProviderSettingsServiceTests {

	private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-15T09:00:00Z"), ZoneOffset.UTC);

	@Test
	void savesEncryptedSharedCredentialsAndNeverReturnsTheSecret() {
		AtomicReference<AiProviderSettings> stored = new AtomicReference<>();
		AiProviderSettingsRepository repository = mock(AiProviderSettingsRepository.class);
		when(repository.findById(1)).thenAnswer(ignored -> Optional.ofNullable(stored.get()));
		when(repository.save(any(AiProviderSettings.class))).thenAnswer(invocation -> {
			AiProviderSettings settings = invocation.getArgument(0);
			stored.set(settings);
			return settings;
		});
		AiSecretCipher cipher = new AiSecretCipher("test-configuration-secret");
		AiProviderSettingsService service = new AiProviderSettingsService(repository, cipher, CLOCK);

		AiProviderSettingsService.SettingsView view = service.save(
				"openai", "sk-shared-provider-secret", "gpt-4.1-mini");

		assertThat(view.configured()).isTrue();
		assertThat(view.apiKeyHint()).endsWith("cret").doesNotContain("sk-shared-provider-secret");
		assertThat(stored.get().apiKeyCiphertext()).doesNotContain("sk-shared-provider-secret");
		assertThat(service.requireCredentials()).isEqualTo(new AiProviderSettingsService.Credentials(
				"openai", "sk-shared-provider-secret", "gpt-4.1-mini"));
		assertThat(service.resolveForTest("openai", null, "gpt-4.1-nano"))
				.isEqualTo(new AiProviderSettingsService.Credentials(
						"openai", "sk-shared-provider-secret", "gpt-4.1-nano"));
	}

	@Test
	void reportsAReadableUnavailableStateBeforeAnAdminConfiguresTheProvider() {
		AiProviderSettingsRepository repository = mock(AiProviderSettingsRepository.class);
		when(repository.findById(1)).thenReturn(Optional.empty());
		AiProviderSettingsService service = new AiProviderSettingsService(
				repository, new AiSecretCipher("test-configuration-secret"), CLOCK);

		assertThatThrownBy(service::requireCredentials)
				.isInstanceOf(ApiException.class)
				.hasMessageContaining("请联系管理员");
	}
}
