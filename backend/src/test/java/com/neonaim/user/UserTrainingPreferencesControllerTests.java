package com.neonaim.user;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
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
class UserTrainingPreferencesControllerTests {

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
	void preferencesAreCreatedReadAndUpdatedForTheCurrentUser() throws Exception {
		String accessToken = register("settings_one", "settings1@example.com");

		mockMvc.perform(get("/api/users/me/training-preferences")
				.header("Authorization", "Bearer " + accessToken))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.configured").value(false))
				.andExpect(jsonPath("$.data.preferences").doesNotExist());

		mockMvc.perform(put("/api/users/me/training-preferences")
				.header("Authorization", "Bearer " + accessToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"preferences":{"schemaVersion":1,"settings":{"language":"en-US","sensitivity":0.72},"projects":{"grid-shot":{"sessionType":"benchmark"}}}}
						"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.message").value("账号设置已同步"))
				.andExpect(jsonPath("$.data.configured").value(true))
				.andExpect(jsonPath("$.data.preferences.settings.sensitivity").value(0.72));

		mockMvc.perform(get("/api/users/me/training-preferences")
				.header("Authorization", "Bearer " + accessToken))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.preferences.settings.language").value("en-US"))
				.andExpect(jsonPath("$.data.preferences.projects.grid-shot.sessionType").value("benchmark"));
	}

	@Test
	void preferencesAreIsolatedBetweenAccountsAndRequireAuthentication() throws Exception {
		String firstAccessToken = register("settings_two", "settings2@example.com");
		mockMvc.perform(put("/api/users/me/training-preferences")
				.header("Authorization", "Bearer " + firstAccessToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"preferences\":{\"schemaVersion\":1,\"settings\":{\"language\":\"en-US\"},\"projects\":{}}}"))
				.andExpect(status().isOk());

		String secondAccessToken = register("settings_three", "settings3@example.com");
		mockMvc.perform(get("/api/users/me/training-preferences")
				.header("Authorization", "Bearer " + secondAccessToken))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.configured").value(false));

		mockMvc.perform(get("/api/users/me/training-preferences"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void unsupportedOrMalformedPreferenceDocumentsAreRejected() throws Exception {
		String accessToken = register("settings_four", "settings4@example.com");

		mockMvc.perform(put("/api/users/me/training-preferences")
				.header("Authorization", "Bearer " + accessToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"preferences\":{\"schemaVersion\":2}}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PREFERENCES_SCHEMA_UNSUPPORTED"));

		mockMvc.perform(put("/api/users/me/training-preferences")
				.header("Authorization", "Bearer " + accessToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"preferences\":[1,2,3]}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PREFERENCES_INVALID"));
	}

	private String register(String username, String email) throws Exception {
		MvcResult result = mockMvc.perform(post("/api/auth/register")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username":"%s","email":"%s","password":"Pilot1234","displayName":"Settings Pilot"}
						""".formatted(username, email)))
				.andExpect(status().isCreated())
				.andReturn();
		return JsonPath.read(result.getResponse().getContentAsString(), "$.data.accessToken");
	}
}
