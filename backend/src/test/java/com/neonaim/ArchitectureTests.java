package com.neonaim;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

class ArchitectureTests {

	@Test
	void moduleBoundariesAreValid() {
		ApplicationModules.of(NeonAimBackendApplication.class).verify();
	}
}
