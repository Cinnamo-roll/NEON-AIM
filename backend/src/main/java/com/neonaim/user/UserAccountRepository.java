package com.neonaim.user;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface UserAccountRepository extends JpaRepository<UserAccount, UUID> {

	Optional<UserAccount> findByUsernameNormalizedOrEmailNormalized(String username, String email);

	boolean existsByUsernameNormalized(String username);

	boolean existsByEmailNormalized(String email);
}
