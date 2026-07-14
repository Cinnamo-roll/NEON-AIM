package com.neonaim.auth;

import com.neonaim.common.error.ApiException;
import com.neonaim.user.api.UserAccountOperations;
import com.neonaim.user.api.UserAccountOperations.RegisterCommand;
import com.neonaim.user.api.UserAccountOperations.UserIdentity;
import com.neonaim.user.api.UserAccountOperations.UserProfile;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class AuthService {

	private final UserAccountOperations accounts;
	private final RefreshTokenRepository refreshTokens;
	private final TokenService tokenService;
	private final AuthProperties properties;
	private final Clock clock;

	AuthService(UserAccountOperations accounts, RefreshTokenRepository refreshTokens,
			TokenService tokenService, AuthProperties properties, Clock clock) {
		this.accounts = accounts;
		this.refreshTokens = refreshTokens;
		this.tokenService = tokenService;
		this.properties = properties;
		this.clock = clock;
	}

	@Transactional
	SessionTokens register(RegisterCommand command, ClientMetadata client) {
		UserIdentity identity = accounts.register(command);
		return createSession(identity, client);
	}

	@Transactional
	SessionTokens login(String identifier, String password, ClientMetadata client) {
		UserIdentity identity = accounts.authenticate(identifier, password);
		return createSession(identity, client);
	}

	@Transactional
	SessionTokens refresh(String rawToken, ClientMetadata client) {
		if (rawToken == null || rawToken.isBlank()) {
			throw unauthorized("REFRESH_TOKEN_MISSING", "登录状态已失效，请重新登录");
		}
		Instant now = clock.instant();
		RefreshToken current = refreshTokens.findByTokenHash(tokenService.hashRefreshToken(rawToken))
				.orElseThrow(() -> unauthorized("REFRESH_TOKEN_INVALID", "登录状态已失效，请重新登录"));
		if (current.revokedAt() != null) {
			revokeAll(current.userId(), now);
			throw unauthorized("REFRESH_TOKEN_REUSED", "检测到重复会话，所有登录状态已注销");
		}
		if (!current.expiresAt().isAfter(now)) {
			current.revoke(now, null);
			refreshTokens.save(current);
			throw unauthorized("REFRESH_TOKEN_EXPIRED", "登录状态已过期，请重新登录");
		}
		UserIdentity identity = accounts.identity(current.userId());
		String replacementRaw = tokenService.createRefreshToken();
		RefreshToken replacement = new RefreshToken(identity.id(), tokenService.hashRefreshToken(replacementRaw),
				now.plus(properties.refreshTokenTtl()), now, client.userAgent(), client.ipAddress());
		refreshTokens.save(replacement);
		current.revoke(now, replacement.id());
		refreshTokens.save(current);
		return session(identity, replacementRaw);
	}

	@Transactional
	void logout(String rawToken) {
		if (rawToken == null || rawToken.isBlank()) return;
		refreshTokens.findByTokenHash(tokenService.hashRefreshToken(rawToken))
				.ifPresent(token -> {
					token.revoke(clock.instant(), null);
					refreshTokens.save(token);
				});
	}

	@Transactional
	void logoutAll(UUID userId) {
		revokeAll(userId, clock.instant());
	}

	@Transactional
	SessionTokens changePassword(UUID userId, String currentPassword, String newPassword, ClientMetadata client) {
		UserIdentity identity = accounts.changePassword(userId, currentPassword, newPassword);
		revokeAll(userId, clock.instant());
		return createSession(identity, client);
	}

	@Transactional
	void deleteAccount(UUID userId, String password) {
		accounts.deleteAccount(userId, password);
		revokeAll(userId, clock.instant());
	}

	private SessionTokens createSession(UserIdentity identity, ClientMetadata client) {
		Instant now = clock.instant();
		String rawRefreshToken = tokenService.createRefreshToken();
		RefreshToken refreshToken = new RefreshToken(identity.id(), tokenService.hashRefreshToken(rawRefreshToken),
				now.plus(properties.refreshTokenTtl()), now, client.userAgent(), client.ipAddress());
		refreshTokens.save(refreshToken);
		return session(identity, rawRefreshToken);
	}

	private SessionTokens session(UserIdentity identity, String rawRefreshToken) {
		TokenService.AccessToken accessToken = tokenService.createAccessToken(identity);
		UserProfile profile = accounts.profile(identity.id());
		return new SessionTokens(new AuthSession(accessToken.value(), "Bearer", accessToken.expiresInSeconds(), profile), rawRefreshToken);
	}

	private void revokeAll(UUID userId, Instant now) {
		List<RefreshToken> activeTokens = refreshTokens.findAllByUserIdAndRevokedAtIsNull(userId);
		activeTokens.forEach(token -> token.revoke(now, null));
		refreshTokens.saveAll(activeTokens);
	}

	private static ApiException unauthorized(String code, String message) {
		return new ApiException(HttpStatus.UNAUTHORIZED, code, message);
	}

	record ClientMetadata(String userAgent, String ipAddress) {
	}

	record AuthSession(String accessToken, String tokenType, long expiresIn, UserProfile user) {
	}

	record SessionTokens(AuthSession session, String refreshToken) {
	}
}
