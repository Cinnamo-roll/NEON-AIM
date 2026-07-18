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
	void moduleEndpointReflectsImplementedAndPlannedBoundaries() throws Exception {
		mockMvc.perform(get("/api/v1/system/modules"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.length()").value(8))
				.andExpect(jsonPath("$.data[0].status").value("active"))
				.andExpect(jsonPath("$.data[1].status").value("active"))
				.andExpect(jsonPath("$.data[2].status").value("active"))
				.andExpect(jsonPath("$.data[3].status").value("planned"))
				.andExpect(jsonPath("$.data[7].status").value("active"))
				.andExpect(jsonPath("$.message").value("认证、用户、训练与 AI 分析模块已开放，其余功能仍在准备中"));
	}
}
