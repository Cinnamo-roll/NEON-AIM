package com.neonaim.user;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface UserTrainingPreferencesRepository extends JpaRepository<UserTrainingPreferences, UUID> {
}
