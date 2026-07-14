package com.neonaim.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_accounts")
class UserAccount {

	enum Role { USER, ADMIN }
	enum Status { ACTIVE, DELETED }
	enum Visibility { PUBLIC, FRIENDS, PRIVATE }

	@Id
	private UUID id;

	@Column(nullable = false, length = 20)
	private String username;

	@Column(name = "username_normalized", nullable = false, unique = true, length = 20)
	private String usernameNormalized;

	@Column(nullable = false, length = 254)
	private String email;

	@Column(name = "email_normalized", nullable = false, unique = true, length = 254)
	private String emailNormalized;

	@Column(name = "password_hash", nullable = false, length = 100)
	private String passwordHash;

	@Column(name = "display_name", nullable = false, length = 24)
	private String displayName;

	@Column(nullable = false, length = 160)
	private String bio;

	@Column(name = "avatar_preset", nullable = false, length = 20)
	private String avatarPreset;

	@Column(name = "accent_color", nullable = false, length = 20)
	private String accentColor;

	@Column(name = "preferred_game", length = 32)
	private String preferredGame;

	@Column(name = "region_code", length = 16)
	private String regionCode;

	@Enumerated(EnumType.STRING)
	@Column(name = "profile_visibility", nullable = false, length = 16)
	private Visibility profileVisibility;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 16)
	private Role role;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 16)
	private Status status;

	@Column(name = "failed_login_attempts", nullable = false)
	private int failedLoginAttempts;

	@Column(name = "locked_until")
	private Instant lockedUntil;

	@Column(name = "last_login_at")
	private Instant lastLoginAt;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@Column(name = "deleted_at")
	private Instant deletedAt;

	@Version
	@Column(nullable = false)
	private long version;

	protected UserAccount() {
	}

	UserAccount(String username, String usernameNormalized, String email, String emailNormalized,
			String passwordHash, String displayName, Instant now) {
		this(username, usernameNormalized, email, emailNormalized, passwordHash, displayName, Role.USER, now);
	}

	UserAccount(String username, String usernameNormalized, String email, String emailNormalized,
			String passwordHash, String displayName, Role role, Instant now) {
		this.id = UUID.randomUUID();
		this.username = username;
		this.usernameNormalized = usernameNormalized;
		this.email = email;
		this.emailNormalized = emailNormalized;
		this.passwordHash = passwordHash;
		this.displayName = displayName;
		this.bio = "";
		this.avatarPreset = "pulse";
		this.accentColor = "cyan";
		this.profileVisibility = Visibility.PUBLIC;
		this.role = role;
		this.status = Status.ACTIVE;
		this.createdAt = now;
		this.updatedAt = now;
	}

	UUID id() { return id; }
	String username() { return username; }
	String email() { return email; }
	String passwordHash() { return passwordHash; }
	String displayName() { return displayName; }
	String bio() { return bio; }
	String avatarPreset() { return avatarPreset; }
	String accentColor() { return accentColor; }
	String preferredGame() { return preferredGame; }
	String regionCode() { return regionCode; }
	Visibility profileVisibility() { return profileVisibility; }
	Role role() { return role; }
	Status status() { return status; }
	int failedLoginAttempts() { return failedLoginAttempts; }
	Instant lockedUntil() { return lockedUntil; }
	Instant lastLoginAt() { return lastLoginAt; }
	Instant createdAt() { return createdAt; }

	void recordFailedLogin(Instant now) {
		failedLoginAttempts++;
		if (failedLoginAttempts >= 5) {
			lockedUntil = now.plusSeconds(15 * 60L);
		}
		updatedAt = now;
	}

	void clearExpiredLock(Instant now) {
		if (lockedUntil != null && !lockedUntil.isAfter(now)) {
			failedLoginAttempts = 0;
			lockedUntil = null;
			updatedAt = now;
		}
	}

	void recordLogin(Instant now) {
		failedLoginAttempts = 0;
		lockedUntil = null;
		lastLoginAt = now;
		updatedAt = now;
	}

	void updateProfile(String displayName, String bio, String avatarPreset, String accentColor,
			String preferredGame, String regionCode, Visibility visibility, Instant now) {
		this.displayName = displayName;
		this.bio = bio;
		this.avatarPreset = avatarPreset;
		this.accentColor = accentColor;
		this.preferredGame = preferredGame;
		this.regionCode = regionCode;
		this.profileVisibility = visibility;
		this.updatedAt = now;
	}

	void changePassword(String passwordHash, Instant now) {
		this.passwordHash = passwordHash;
		this.updatedAt = now;
	}

	void promoteToAdmin(Instant now) {
		this.role = Role.ADMIN;
		this.updatedAt = now;
	}

	void delete(Instant now) {
		String suffix = id.toString().replace("-", "");
		this.username = "deleted_" + suffix.substring(0, 12);
		this.usernameNormalized = this.username;
		this.email = "deleted+" + suffix + "@invalid.local";
		this.emailNormalized = this.email;
		this.passwordHash = "!deleted!";
		this.displayName = "已注销玩家";
		this.bio = "";
		this.preferredGame = null;
		this.regionCode = null;
		this.status = Status.DELETED;
		this.deletedAt = now;
		this.updatedAt = now;
	}
}
