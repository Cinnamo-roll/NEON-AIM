package com.neonaim.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.boot.ApplicationArguments;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class LocalAdminAccountSeederTests {

	@Test
	void createsTheLocalAdminWithTheConfiguredPasswordAndRole() {
		UserAccountRepository repository = mock(UserAccountRepository.class);
		when(repository.findByUsernameNormalizedOrEmailNormalized("admin", "admin@neonaim.local"))
				.thenReturn(Optional.empty());
		AtomicReference<UserAccount> saved = new AtomicReference<>();
		when(repository.save(any(UserAccount.class))).thenAnswer(invocation -> {
			UserAccount account = invocation.getArgument(0);
			saved.set(account);
			return account;
		});
		BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
		LocalAdminAccountSeeder seeder = new LocalAdminAccountSeeder(repository, encoder,
				Clock.fixed(Instant.parse("2026-07-14T08:00:00Z"), ZoneOffset.UTC), true,
				"admin", "admin@neonaim.local", "Aurora520", "NEON Admin");

		seeder.run(mock(ApplicationArguments.class));

		assertThat(saved.get()).isNotNull();
		assertThat(saved.get().username()).isEqualTo("admin");
		assertThat(saved.get().role()).isEqualTo(UserAccount.Role.ADMIN);
		assertThat(encoder.matches("Aurora520", saved.get().passwordHash())).isTrue();
	}
}
