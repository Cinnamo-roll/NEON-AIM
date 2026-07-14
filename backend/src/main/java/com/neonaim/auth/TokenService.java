package com.neonaim.auth;

import com.neonaim.user.api.UserAccountOperations.UserIdentity;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.stereotype.Service;

@Service
class TokenService {

	private final JwtEncoder encoder;
	private final AuthProperties properties;
	private final Clock clock;
	private final SecureRandom secureRandom = new SecureRandom();

	TokenService(JwtEncoder encoder, AuthProperties properties, Clock clock) {
		this.encoder = encoder;
		this.properties = properties;
		this.clock = clock;
	}

	AccessToken createAccessToken(UserIdentity identity) {
		Instant issuedAt = clock.instant();
		Instant expiresAt = issuedAt.plus(properties.accessTokenTtl());
		JwtClaimsSet claims = JwtClaimsSet.builder()
				.issuer(properties.issuer())
				.issuedAt(issuedAt)
				.expiresAt(expiresAt)
				.subject(identity.id().toString())
				.claim("username", identity.username())
				.claim("display_name", identity.displayName())
				.claim("roles", List.of("ROLE_" + identity.role()))
				.build();
		JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).type("JWT").build();
		String value = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
		return new AccessToken(value, properties.accessTokenTtl().toSeconds(), expiresAt);
	}

	String createRefreshToken() {
		byte[] bytes = new byte[32];
		secureRandom.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	String hashRefreshToken(String token) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
					.digest(token.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
		} catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException("SHA-256 is unavailable", exception);
		}
	}

	record AccessToken(String value, long expiresInSeconds, Instant expiresAt) {
	}
}
