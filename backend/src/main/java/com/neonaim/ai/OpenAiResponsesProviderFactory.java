package com.neonaim.ai;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
class OpenAiResponsesProviderFactory {

	private static final String RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
	private final HttpClient httpClient;
	private final ObjectMapper objectMapper;

	@Autowired
	OpenAiResponsesProviderFactory(ObjectMapper objectMapper) {
		this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build(), objectMapper);
	}

	OpenAiResponsesProviderFactory(HttpClient httpClient, ObjectMapper objectMapper) {
		this.httpClient = httpClient;
		this.objectMapper = objectMapper;
	}

	TrainingAnalysisProvider create(String apiKey, String model) {
		return new OpenAiResponsesProvider(httpClient, objectMapper, RESPONSES_ENDPOINT, apiKey, model);
	}
}
