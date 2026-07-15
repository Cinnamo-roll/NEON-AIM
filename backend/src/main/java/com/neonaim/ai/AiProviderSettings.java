package com.neonaim.ai;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;

@Entity
@Table(name = "ai_provider_settings")
class AiProviderSettings {

	@Id
	private Integer id;

	@Column(name = "provider_id", nullable = false, length = 32)
	private String provider;

	@Column(name = "api_key_ciphertext", nullable = false, length = 1024)
	private String apiKeyCiphertext;

	@Column(name = "model_name", nullable = false, length = 120)
	private String model;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@Version
	@Column(nullable = false)
	private long version;

	protected AiProviderSettings() {
	}

	AiProviderSettings(String provider, String apiKeyCiphertext, String model, Instant updatedAt) {
		this.id = 1;
		update(provider, apiKeyCiphertext, model, updatedAt);
	}

	void update(String provider, String apiKeyCiphertext, String model, Instant updatedAt) {
		this.provider = provider;
		this.apiKeyCiphertext = apiKeyCiphertext;
		this.model = model;
		this.updatedAt = updatedAt;
	}

	String provider() { return provider; }
	String apiKeyCiphertext() { return apiKeyCiphertext; }
	String model() { return model; }
	Instant updatedAt() { return updatedAt; }
}

