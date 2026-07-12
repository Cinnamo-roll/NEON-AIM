package com.neonaim.system;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class SystemControllerTests {

	private MockMvc mockMvc;

	@BeforeEach
	void setUp() {
		mockMvc = MockMvcBuilders.standaloneSetup(new SystemController()).build();
	}

	@Test
	void healthEndpointReportsServiceStatus() throws Exception {
		mockMvc.perform(get("/api/health"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("ok"))
				.andExpect(jsonPath("$.service").value("neon-aim-backend"));
	}

	@Test
	void moduleEndpointListsPlannedBoundaries() throws Exception {
		mockMvc.perform(get("/api/v1/system/modules"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.length()").value(8))
				.andExpect(jsonPath("$.data[0].status").value("planned"))
				.andExpect(jsonPath("$.message").value("功能仍在准备中"));
	}
}
