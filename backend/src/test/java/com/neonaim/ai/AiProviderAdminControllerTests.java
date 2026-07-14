package com.neonaim.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.neonaim.common.api.ApiResponse;
import org.junit.jupiter.api.Test;

class AiProviderAdminControllerTests {

	@Test
	void returnsUsageAndResolvedModelForAWorkingChannel() {
		TrainingAnalysisProviderRegistry registry = mock(TrainingAnalysisProviderRegistry.class);
		TrainingAnalysisProvider provider = mock(TrainingAnalysisProvider.class);
		when(registry.create("deepseek", "sk-deepseek-test-key", "deepseek-v4-flash")).thenReturn(provider);
		when(provider.testConnection()).thenReturn(new TrainingAnalysisProvider.ConnectionResult(
				"deepseek-v4-flash", new TrainingAnalysisProvider.TokenUsage(9, 4)));
		AiProviderAdminController controller = new AiProviderAdminController(registry);

		ApiResponse<AiProviderAdminController.ConnectionTestView> response = controller.test(
				new AiProviderAdminController.ConnectionTestRequest(
						"deepseek", "sk-deepseek-test-key", "deepseek-v4-flash"));

		assertThat(response.data().success()).isTrue();
		assertThat(response.data().resolvedModel()).isEqualTo("deepseek-v4-flash");
		assertThat(response.data().inputTokens() + response.data().outputTokens()).isEqualTo(13);
	}

	@Test
	void returnsAReadableFailureWithoutThrowingOrEchoingTheKey() {
		TrainingAnalysisProviderRegistry registry = mock(TrainingAnalysisProviderRegistry.class);
		TrainingAnalysisProvider provider = mock(TrainingAnalysisProvider.class);
		when(registry.create("bailian", "sk-bailian-invalid-key", "qwen3.6-flash")).thenReturn(provider);
		when(provider.testConnection()).thenThrow(new ModelProviderException(
				"AI_API_KEY_INVALID", "Invalid API key sk-bailian-invalid-key"));
		AiProviderAdminController controller = new AiProviderAdminController(registry);

		ApiResponse<AiProviderAdminController.ConnectionTestView> response = controller.test(
				new AiProviderAdminController.ConnectionTestRequest(
						"bailian", "sk-bailian-invalid-key", "qwen3.6-flash"));

		assertThat(response.data().success()).isFalse();
		assertThat(response.data().failureCode()).isEqualTo("AI_API_KEY_INVALID");
		assertThat(response.data().message()).doesNotContain("sk-bailian-invalid-key");
	}
}
