package com.neonaim.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "refresh_tokens")
class RefreshToken {

	@Id
	private UUID id;

	@Column(name = "user_id", nullable = false)
	private UUID userId;

	@Column(name = "token_hash", nullable = false, unique = true, length = 64)
	private String tokenHash;

	@Column(name = "expires_at", nullable = false)
	private Instant expiresAt;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "revoked_at")
	private Instant revokedAt;

	@Column(name = "replaced_by_token_id")
	private UUID replacedByTokenId;

	@Column(name = "user_agent", length = 255)
	private String userAgent;

	@Column(name = "ip_address", length = 64)
	private String ipAddress;

	protected RefreshToken() {
	}

	RefreshToken(UUID userId, String tokenHash, Instant expiresAt, Instant createdAt, String userAgent, String ipAddress) {
		this.id = UUID.randomUUID();
		this.userId = userId;
		this.tokenHash = tokenHash;
		this.expiresAt = expiresAt;
		this.createdAt = createdAt;
		this.userAgent = userAgent;
		this.ipAddress = ipAddress;
	}

	UUID id() { return id; }
	UUID userId() { return userId; }
	Instant expiresAt() { return expiresAt; }
	Instant revokedAt() { return revokedAt; }

	void revoke(Instant now, UUID replacementId) {
		if (revokedAt == null) {
			revokedAt = now;
			replacedByTokenId = replacementId;
		}
	}
}
