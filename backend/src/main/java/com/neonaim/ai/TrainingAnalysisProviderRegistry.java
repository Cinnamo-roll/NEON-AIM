package com.neonaim.ai;

import java.util.Locale;
import org.springframework.stereotype.Component;

@Component
class TrainingAnalysisProviderRegistry {

	private final OpenAiResponsesProviderFactory openAiFactory;
	private final OpenAiCompatibleChatProviderFactory chatFactory;

	TrainingAnalysisProviderRegistry(OpenAiResponsesProviderFactory openAiFactory,
			OpenAiCompatibleChatProviderFactory chatFactory) {
		this.openAiFactory = openAiFactory;
		this.chatFactory = chatFactory;
	}

	TrainingAnalysisProvider create(String provider, String apiKey, String model) {
		return switch (provider.trim().toLowerCase(Locale.ROOT)) {
			case "openai" -> openAiFactory.create(apiKey, model);
			case "deepseek" -> chatFactory.create(OpenAiCompatibleChatProvider.Profile.DEEPSEEK, apiKey, model);
			case "bailian" -> chatFactory.create(OpenAiCompatibleChatProvider.Profile.BAILIAN, apiKey, model);
			default -> throw new IllegalArgumentException("unsupported AI provider");
		};
	}
}
