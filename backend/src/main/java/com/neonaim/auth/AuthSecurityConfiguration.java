package com.neonaim.auth;

import java.nio.charset.StandardCharsets;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

@Configuration
@EnableConfigurationProperties(AuthProperties.class)
class AuthSecurityConfiguration {

	@Bean
	JwtEncoder jwtEncoder(AuthProperties properties) {
		return NimbusJwtEncoder.withSecretKey(secretKey(properties)).build();
	}

	@Bean
	JwtDecoder jwtDecoder(AuthProperties properties) {
		NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(secretKey(properties))
				.macAlgorithm(MacAlgorithm.HS256)
				.build();
		decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(properties.issuer()));
		return decoder;
	}

	private static SecretKey secretKey(AuthProperties properties) {
		return new SecretKeySpec(properties.jwtSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
	}
}
