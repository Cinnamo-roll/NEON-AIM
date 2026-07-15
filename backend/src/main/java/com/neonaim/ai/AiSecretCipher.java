package com.neonaim.ai;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
class AiSecretCipher {

	private static final String PREFIX = "v1:";
	private static final int IV_LENGTH = 12;
	private static final int TAG_LENGTH_BITS = 128;

	private final SecretKeySpec key;
	private final SecureRandom secureRandom = new SecureRandom();

	AiSecretCipher(@Value("${app.ai.configuration-secret}") String secret) {
		if (secret == null || secret.isBlank()) {
			throw new IllegalArgumentException("AI configuration secret must not be blank");
		}
		try {
			this.key = new SecretKeySpec(MessageDigest.getInstance("SHA-256")
					.digest(secret.getBytes(StandardCharsets.UTF_8)), "AES");
		}
		catch (GeneralSecurityException exception) {
			throw new IllegalStateException("AI configuration encryption is unavailable", exception);
		}
	}

	String encrypt(String value) {
		byte[] iv = new byte[IV_LENGTH];
		secureRandom.nextBytes(iv);
		try {
			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
			byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
			return PREFIX + Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + encrypted.length)
					.put(iv).put(encrypted).array());
		}
		catch (GeneralSecurityException exception) {
			throw new IllegalStateException("AI configuration could not be encrypted", exception);
		}
	}

	String decrypt(String value) {
		if (value == null || !value.startsWith(PREFIX)) {
			throw new IllegalStateException("AI configuration encryption version is unsupported");
		}
		byte[] payload = Base64.getDecoder().decode(value.substring(PREFIX.length()));
		if (payload.length <= IV_LENGTH) {
			throw new IllegalStateException("AI configuration ciphertext is invalid");
		}
		byte[] iv = new byte[IV_LENGTH];
		byte[] encrypted = new byte[payload.length - IV_LENGTH];
		System.arraycopy(payload, 0, iv, 0, IV_LENGTH);
		System.arraycopy(payload, IV_LENGTH, encrypted, 0, encrypted.length);
		try {
			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
			return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
		}
		catch (GeneralSecurityException exception) {
			throw new IllegalStateException("AI configuration could not be decrypted", exception);
		}
	}
}
