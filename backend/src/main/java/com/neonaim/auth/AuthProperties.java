package com.neonaim.auth;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.auth")
record AuthProperties(
		String issuer,
		String jwtSecret,
		Duration accessTokenTtl,
		Duration refreshTokenTtl,
		String refreshCookieName,
		boolean refreshCookieSecure) {

	AuthProperties {
		if (jwtSecret == null || jwtSecret.length() < 32) {
			throw new IllegalArgumentException("app.auth.jwt-secret must contain at least 32 characters");
		}
	}
}
