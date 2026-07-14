package com.neonaim.user.api;

import java.time.Instant;
import java.util.UUID;

public interface UserAccountOperations {

	UserIdentity register(RegisterCommand command);

	UserIdentity authenticate(String identifier, String password);

	UserIdentity identity(UUID userId);

	UserProfile profile(UUID userId);

	UserProfile updateProfile(UUID userId, UpdateProfileCommand command);

	UserIdentity changePassword(UUID userId, String currentPassword, String newPassword);

	void deleteAccount(UUID userId, String password);

	record RegisterCommand(String username, String email, String password, String displayName) {
	}

	record UpdateProfileCommand(
			String displayName,
			String bio,
			String avatarPreset,
			String accentColor,
			String preferredGame,
			String regionCode,
			String profileVisibility) {
	}

	record UserIdentity(UUID id, String username, String displayName, String role) {
	}

	record UserProfile(
			UUID id,
			String username,
			String email,
			String displayName,
			String bio,
			String avatarPreset,
			String accentColor,
			String preferredGame,
			String regionCode,
			String profileVisibility,
			String role,
			Instant createdAt,
			Instant lastLoginAt) {
	}
}
