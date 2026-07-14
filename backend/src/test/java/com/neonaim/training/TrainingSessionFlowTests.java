package com.neonaim.training;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
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
class TrainingSessionFlowTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@BeforeEach
	void cleanDatabase() {
		jdbcTemplate.update("DELETE FROM training_coaching_tasks");
		jdbcTemplate.update("DELETE FROM training_career_ai_analysis_calls");
		jdbcTemplate.update("DELETE FROM training_ai_analysis_calls");
		jdbcTemplate.update("DELETE FROM training_ai_analysis_cache");
		jdbcTemplate.update("DELETE FROM training_session_analyses");
		jdbcTemplate.update("DELETE FROM training_sessions");
		jdbcTemplate.update("DELETE FROM refresh_tokens");
		jdbcTemplate.update("DELETE FROM user_accounts");
	}

	@Test
	void authenticatedPlayerCanSaveOnceListAndReadFullDetail() throws Exception {
		String token = registerAndToken("training_pilot", "training@example.com");
		mockMvc.perform(post("/api/admin/ai/providers/test")
					.header("Authorization", "Bearer " + token)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"provider":"openai","apiKey":"sk-test-user-key-value","model":"gpt-4o-mini"}
							"""))
				.andExpect(status().isForbidden());
		String payload = payload("client-session-1", 2);

		MvcResult created = mockMvc.perform(post("/api/training/sessions")
					.header("Authorization", "Bearer " + token)
					.contentType(MediaType.APPLICATION_JSON)
					.content(payload))
				.andExpect(status().isCreated())
				.andExpect(header().string("Location", org.hamcrest.Matchers.containsString("/api/training/sessions/")))
				.andExpect(jsonPath("$.data.summary.trainingId").value("grid-shot"))
				.andExpect(jsonPath("$.data.summary.sessionType").value("benchmark"))
				.andExpect(jsonPath("$.data.summary.score").value(260.0))
				.andExpect(jsonPath("$.data.detail.segments.length()").value(12))
				.andExpect(jsonPath("$.data.detail.events.length()").value(3))
				.andExpect(jsonPath("$.data.analysis.status").value("READY"))
				.andExpect(jsonPath("$.data.analysis.source").value("RULES"))
				.andExpect(jsonPath("$.data.analysis.engineVersion").value("grid-shot-rules-v1"))
				.andExpect(jsonPath("$.data.analysis.findings[0].code").value("ACCURACY_LIMITS_PACE"))
				.andExpect(jsonPath("$.data.analysis.nextAction.targets[0].metric").value("accuracy"))
				.andExpect(jsonPath("$.data.analysis.usage.inputTokens").value(0))
				.andReturn();
		String sessionId = JsonPath.read(created.getResponse().getContentAsString(), "$.data.summary.id");

		mockMvc.perform(get("/api/training/sessions/" + sessionId + "/ai-analysis")
					.header("Authorization", "Bearer " + token))
				.andExpect(status().isForbidden());
		mockMvc.perform(get("/api/training/career/grid-shot/ai-analysis")
					.header("Authorization", "Bearer " + token))
				.andExpect(status().isForbidden());
		mockMvc.perform(get("/api/training/career/grid-shot/coaching-task")
					.header("Authorization", "Bearer " + token))
				.andExpect(status().isForbidden());
		mockMvc.perform(get("/api/training/career/grid-shot/profile")
					.header("Authorization", "Bearer " + token))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.profileVersion").value("grid-shot-career-profile-v1"))
				.andExpect(jsonPath("$.data.benchmark.configurationKey").value("grid-shot:60s:medium"))
				.andExpect(jsonPath("$.data.sample.benchmarkSessions").value(1))
				.andExpect(jsonPath("$.data.sample.freePracticeSessions").value(0))
				.andExpect(jsonPath("$.data.sample.confidence").value("OBSERVING"))
				.andExpect(jsonPath("$.data.coverage.availableDimensions").value(4))
				.andExpect(jsonPath("$.data.dimensions.length()").value(4))
				.andExpect(jsonPath("$.data.dimensions[0].code").value("CLICK_PRECISION"))
				.andExpect(jsonPath("$.data.dimensions[0].metrics[0].current").value(66.7));

		jdbcTemplate.update("UPDATE user_accounts SET role = 'ADMIN' WHERE username_normalized = ?", "training_pilot");
		String adminToken = loginAndToken("training_pilot", "Pilot1234");
		mockMvc.perform(get("/api/training/sessions/" + sessionId + "/ai-analysis")
					.header("Authorization", "Bearer " + adminToken))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("NOT_REQUESTED"))
				.andExpect(jsonPath("$.data.analysis.source").value("RULES"))
				.andExpect(jsonPath("$.data.analysis.usage.inputTokens").value(0));
		mockMvc.perform(get("/api/training/career/grid-shot/coaching-task")
					.header("Authorization", "Bearer " + adminToken))
				.andExpect(status().isOk());

		mockMvc.perform(post("/api/training/sessions")
					.header("Authorization", "Bearer " + token)
					.contentType(MediaType.APPLICATION_JSON)
					.content(payload))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.summary.id").value(sessionId))
				.andExpect(jsonPath("$.message").value("训练成绩已经存在"));
		org.assertj.core.api.Assertions.assertThat(jdbcTemplate.queryForObject(
				"SELECT COUNT(*) FROM training_session_analyses", Integer.class)).isEqualTo(1);

		mockMvc.perform(get("/api/training/sessions")
					.header("Authorization", "Bearer " + token))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.totalElements").value(1))
				.andExpect(jsonPath("$.data.items[0].clientSessionId").value("client-session-1"));

		mockMvc.perform(get("/api/training/sessions/{sessionId}", sessionId)
					.header("Authorization", "Bearer " + token))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.analysisSnapshot.windows.length()").value(3))
				.andExpect(jsonPath("$.data.analysis.headline").isNotEmpty())
				.andExpect(jsonPath("$.data.summary.analysisDataVersion").isNotEmpty());

		mockMvc.perform(get("/api/training/sessions/{sessionId}/analysis", sessionId)
					.header("Authorization", "Bearer " + token))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.source").value("RULES"))
				.andExpect(jsonPath("$.data.nextAction.targets.length()").value(2));
	}

	@Test
	void anotherPlayerCannotReadTheStoredSession() throws Exception {
		String ownerToken = registerAndToken("session_owner", "owner@example.com");
		String otherToken = registerAndToken("other_pilot", "other@example.com");
		MvcResult created = mockMvc.perform(post("/api/training/sessions")
					.header("Authorization", "Bearer " + ownerToken)
					.contentType(MediaType.APPLICATION_JSON)
					.content(payload("private-session", 2)))
				.andExpect(status().isCreated())
				.andReturn();
		String sessionId = JsonPath.read(created.getResponse().getContentAsString(), "$.data.summary.id");

		mockMvc.perform(get("/api/training/sessions/{sessionId}", sessionId)
					.header("Authorization", "Bearer " + otherToken))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("TRAINING_SESSION_NOT_FOUND"));

		mockMvc.perform(get("/api/training/sessions/{sessionId}/analysis", sessionId)
					.header("Authorization", "Bearer " + otherToken))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("TRAINING_SESSION_NOT_FOUND"));
	}

	@Test
	void mismatchedSummaryIsRejectedAndNothingIsStored() throws Exception {
		String token = registerAndToken("invalid_pilot", "invalid@example.com");

		mockMvc.perform(post("/api/training/sessions")
					.header("Authorization", "Bearer " + token)
					.contentType(MediaType.APPLICATION_JSON)
					.content(payload("invalid-session", 3)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("TRAINING_SUMMARY_MISMATCH"));

		mockMvc.perform(get("/api/training/sessions")
					.header("Authorization", "Bearer " + token))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.totalElements").value(0));
	}

	private String registerAndToken(String username, String email) throws Exception {
		MvcResult registration = mockMvc.perform(post("/api/auth/register")
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"username":"%s","email":"%s","password":"Pilot1234","displayName":"Pilot"}
							""".formatted(username, email)))
				.andExpect(status().isCreated())
				.andReturn();
		return JsonPath.read(registration.getResponse().getContentAsString(), "$.data.accessToken");
	}

	private String loginAndToken(String identifier, String password) throws Exception {
		MvcResult login = mockMvc.perform(post("/api/auth/login")
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"identifier":"%s","password":"%s"}
							""".formatted(identifier, password)))
				.andExpect(status().isOk())
				.andReturn();
		return JsonPath.read(login.getResponse().getContentAsString(), "$.data.accessToken");
	}

	private static String payload(String clientSessionId, int summaryHits) {
		String segments = IntStream.range(0, 12)
				.mapToObj(index -> {
					int hits = index == 0 ? 2 : 0;
					int misses = index == 1 ? 1 : 0;
					int score = index == 0 ? 260 : 0;
					return """
							{"index":%d,"startMs":%d,"endMs":%d,"hits":%d,"misses":%d,"accuracy":0,"targetsPerMinute":0,"averageHitInterval":0,"consistencyScore":0,"score":%d,"maxCombo":2}
							""".formatted(index, index * 5_000, (index + 1) * 5_000, hits, misses, score).strip();
				})
				.collect(Collectors.joining(","));
		return """
				{
				  "clientSessionId":"%s",
				  "trainingId":"grid-shot",
				  "modeVersion":1,
				  "scoringVersion":1,
				  "configurationKey":"grid-shot:60s:medium",
				  "sessionType":"benchmark",
				  "startedAt":"2026-07-14T04:00:00Z",
				  "completedAt":"2026-07-14T04:01:00Z",
				  "durationMs":60000,
				  "configuration":{"duration":60,"targetSize":"medium","activeTargetCount":3},
				  "summary":{"score":260,"hits":%d,"misses":1,"accuracy":66.7,"targetsPerMinute":2,"averageHitInterval":1000,"consistencyScore":0,"maxCombo":2,"grade":"D"},
				  "detail":{"segments":[%s],"events":[
				    {"id":"e1","sessionId":"%s","timestamp":1000,"elapsedMs":1000,"type":"hit","comboBefore":0,"comboAfter":1,"baseScore":100,"speedBonus":30,"comboBonus":0,"stabilityBonus":0,"totalScore":130},
				    {"id":"e2","sessionId":"%s","timestamp":2000,"elapsedMs":2000,"type":"hit","comboBefore":1,"comboAfter":2,"baseScore":100,"speedBonus":30,"comboBonus":0,"stabilityBonus":0,"totalScore":130},
				    {"id":"e3","sessionId":"%s","timestamp":6000,"elapsedMs":6000,"type":"miss","comboBefore":2,"comboAfter":0,"baseScore":0,"speedBonus":0,"comboBonus":0,"stabilityBonus":0,"totalScore":0}
				  ]},
				  "analysisSnapshot":{"schemaVersion":1,"scope":"session","training":{"id":"grid-shot","modeVersion":1,"scoringVersion":1,"configurationKey":"grid-shot:60s:medium"},"source":{"sessionId":"%s","completedAt":"2026-07-14T04:01:00Z"},"summary":{"score":260,"hits":%d,"misses":1,"accuracy":66.7,"targetsPerMinute":2,"averageHitInterval":1000,"consistencyScore":0,"maxCombo":2,"grade":"D"},"windows":[{"label":"phase1"},{"label":"phase2"},{"label":"phase3"}],"signals":[],"integrity":{"passed":true,"errors":[]}},
				  "integrity":{"passed":true,"errors":[]}
				}
				""".formatted(clientSessionId, summaryHits, segments, clientSessionId, clientSessionId,
				clientSessionId, clientSessionId, summaryHits);
	}
}
