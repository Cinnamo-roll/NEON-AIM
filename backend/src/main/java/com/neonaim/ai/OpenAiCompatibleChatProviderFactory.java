package com.neonaim.ai;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
class OpenAiCompatibleChatProviderFactory {

	private final HttpClient httpClient;
	private final ObjectMapper objectMapper;

	@Autowired
	OpenAiCompatibleChatProviderFactory(ObjectMapper objectMapper) {
		this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build(), objectMapper);
	}

	OpenAiCompatibleChatProviderFactory(HttpClient httpClient, ObjectMapper objectMapper) {
		this.httpClient = httpClient;
		this.objectMapper = objectMapper;
	}

	TrainingAnalysisProvider create(OpenAiCompatibleChatProvider.Profile profile, String apiKey, String model) {
		return new OpenAiCompatibleChatProvider(httpClient, objectMapper, profile, apiKey, model);
	}
}
