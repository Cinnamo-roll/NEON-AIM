package com.neonaim.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class AuthenticationFlowTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@BeforeEach
	void cleanDatabase() {
		jdbcTemplate.update("DELETE FROM refresh_tokens");
		jdbcTemplate.update("DELETE FROM user_accounts");
	}

	@Test
	void registrationProfileUpdateRefreshAndLogoutFormACompleteSessionFlow() throws Exception {
		MvcResult registration = register("pilot_one", "pilot@example.com", "Pilot1234")
				.andExpect(status().isCreated())
				.andExpect(cookie().httpOnly("neon_refresh", true))
				.andExpect(jsonPath("$.data.user.username").value("pilot_one"))
				.andExpect(jsonPath("$.data.user.displayName").value("Pilot One"))
				.andReturn();
		String accessToken = JsonPath.read(registration.getResponse().getContentAsString(), "$.data.accessToken");
		Cookie refreshCookie = registration.getResponse().getCookie("neon_refresh");

		mockMvc.perform(get("/api/users/me").header("Authorization", "Bearer " + accessToken))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.email").value("pilot@example.com"))
				.andExpect(jsonPath("$.data.profileVisibility").value("PUBLIC"));

		mockMvc.perform(patch("/api/users/me")
					.header("Authorization", "Bearer " + accessToken)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"displayName":"Neon Pilot","bio":"稳定，再快一点。","avatarPreset":"nova","accentColor":"violet","preferredGame":"valorant","regionCode":"CN","profileVisibility":"FRIENDS"}
							"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.displayName").value("Neon Pilot"))
				.andExpect(jsonPath("$.data.avatarPreset").value("nova"))
				.andExpect(jsonPath("$.data.accentColor").value("violet"));

		MvcResult refreshed = mockMvc.perform(post("/api/auth/refresh")
					.cookie(refreshCookie)
					.header("X-Requested-With", "NEON-AIM"))
				.andExpect(status().isOk())
				.andExpect(cookie().httpOnly("neon_refresh", true))
				.andExpect(jsonPath("$.data.user.displayName").value("Neon Pilot"))
				.andReturn();
		Cookie rotatedCookie = refreshed.getResponse().getCookie("neon_refresh");

		mockMvc.perform(post("/api/auth/logout")
					.cookie(rotatedCookie)
					.header("X-Requested-With", "NEON-AIM"))
				.andExpect(status().isOk())
				.andExpect(cookie().maxAge("neon_refresh", 0));

		mockMvc.perform(post("/api/auth/refresh")
					.cookie(rotatedCookie)
					.header("X-Requested-With", "NEON-AIM"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("REFRESH_TOKEN_REUSED"));
	}

	@Test
	void passwordChangeRotatesSessionsAndAccountDeletionAnonymizesLogin() throws Exception {
		MvcResult registration = register("pilot_two", "pilot2@example.com", "Pilot1234")
				.andExpect(status().isCreated())
				.andReturn();
		String accessToken = JsonPath.read(registration.getResponse().getContentAsString(), "$.data.accessToken");

		MvcResult changed = mockMvc.perform(post("/api/auth/password")
					.header("Authorization", "Bearer " + accessToken)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"currentPassword\":\"Pilot1234\",\"newPassword\":\"NewPilot5678\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.message").value("密码已更新，其他设备已退出"))
				.andReturn();
		String changedAccessToken = JsonPath.read(changed.getResponse().getContentAsString(), "$.data.accessToken");

		login("pilot_two", "Pilot1234").andExpect(status().isUnauthorized());
		login("pilot_two", "NewPilot5678").andExpect(status().isOk());

		mockMvc.perform(delete("/api/users/me")
					.header("Authorization", "Bearer " + changedAccessToken)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"password\":\"NewPilot5678\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.message").value("账户已注销"));

		login("pilot_two", "NewPilot5678")
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
	}

	@Test
	void duplicateAccountsWeakPasswordsAndProtectedEndpointsAreRejected() throws Exception {
		register("pilot_three", "pilot3@example.com", "Pilot1234").andExpect(status().isCreated());
		register("PILOT_THREE", "another@example.com", "Pilot1234")
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("USERNAME_TAKEN"));
		register("another_pilot", "PILOT3@example.com", "Pilot1234")
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("EMAIL_TAKEN"));
		register("weak_pilot", "weak@example.com", "password")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PASSWORD_WEAK"));

		mockMvc.perform(get("/api/users/me")).andExpect(status().isUnauthorized());
		mockMvc.perform(post("/api/auth/refresh"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("SPA_HEADER_REQUIRED"));
	}

	@Test
	void malformedRegistrationReturnsAReadableProblemResponse() throws Exception {
		mockMvc.perform(post("/api/auth/register")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{not-json}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_JSON"))
				.andExpect(jsonPath("$.detail").value("请求内容格式无效，请刷新页面后重试"));
	}

	@Test
	void localFrontendHostsCanBothReachRegistration() throws Exception {
		for (String origin : new String[] { "http://127.0.0.1:5173", "http://localhost:5173" }) {
			mockMvc.perform(options("/api/auth/register")
					.header("Origin", origin)
					.header("Access-Control-Request-Method", "POST")
					.header("Access-Control-Request-Headers", "content-type,x-requested-with"))
					.andExpect(status().isOk())
					.andExpect(header().string("Access-Control-Allow-Origin", origin));
		}
	}

	private org.springframework.test.web.servlet.ResultActions register(String username, String email, String password) throws Exception {
		return mockMvc.perform(post("/api/auth/register")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username":"%s","email":"%s","password":"%s","displayName":"Pilot One"}
						""".formatted(username, email, password)));
	}

	private org.springframework.test.web.servlet.ResultActions login(String identifier, String password) throws Exception {
		return mockMvc.perform(post("/api/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"identifier":"%s","password":"%s"}
						""".formatted(identifier, password)));
	}
}
