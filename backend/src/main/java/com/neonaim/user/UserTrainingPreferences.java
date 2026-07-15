package com.neonaim.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_training_preferences")
class UserTrainingPreferences {

	@Id
	@Column(name = "user_id", nullable = false)
	private UUID userId;

	@Column(name = "preferences_json", nullable = false, columnDefinition = "TEXT")
	private String preferencesJson;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@Version
	@Column(nullable = false)
	private long version;

	protected UserTrainingPreferences() {
	}

	UserTrainingPreferences(UUID userId, String preferencesJson, Instant updatedAt) {
		this.userId = userId;
		update(preferencesJson, updatedAt);
	}

	void update(String preferencesJson, Instant updatedAt) {
		this.preferencesJson = preferencesJson;
		this.updatedAt = updatedAt;
	}

	String preferencesJson() { return preferencesJson; }
	Instant updatedAt() { return updatedAt; }
}
