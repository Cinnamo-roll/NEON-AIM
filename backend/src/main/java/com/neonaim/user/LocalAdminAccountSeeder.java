package com.neonaim.user;

import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Profile("local")
class LocalAdminAccountSeeder implements ApplicationRunner {

	private final UserAccountRepository repository;
	private final PasswordEncoder passwordEncoder;
	private final Clock clock;
	private final boolean enabled;
	private final String username;
	private final String email;
	private final String password;
	private final String displayName;

	LocalAdminAccountSeeder(UserAccountRepository repository, PasswordEncoder passwordEncoder, Clock clock,
			@Value("${app.local-admin.enabled:false}") boolean enabled,
			@Value("${app.local-admin.username:admin}") String username,
			@Value("${app.local-admin.email:admin@neonaim.local}") String email,
			@Value("${app.local-admin.password:}") String password,
			@Value("${app.local-admin.display-name:NEON Admin}") String displayName) {
		this.repository = repository;
		this.passwordEncoder = passwordEncoder;
		this.clock = clock;
		this.enabled = enabled;
		this.username = username.trim();
		this.email = email.trim().toLowerCase(Locale.ROOT);
		this.password = password;
		this.displayName = displayName.trim();
	}

	@Override
	@Transactional
	public void run(ApplicationArguments arguments) {
		if (!enabled || password.isBlank()) return;
		String normalizedUsername = username.toLowerCase(Locale.ROOT);
		Instant now = clock.instant();
		UserAccount existing = repository
				.findByUsernameNormalizedOrEmailNormalized(normalizedUsername, email)
				.orElse(null);
		if (existing != null) {
			if (existing.status() == UserAccount.Status.ACTIVE && existing.role() != UserAccount.Role.ADMIN) {
				existing.promoteToAdmin(now);
				repository.save(existing);
			}
			return;
		}
		repository.save(new UserAccount(username, normalizedUsername, email, email,
				passwordEncoder.encode(password), displayName, UserAccount.Role.ADMIN, now));
	}
}
