package com.neonaim.ai;

import java.time.Clock;
import java.util.List;
import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
class TrainingAiConfiguration {

	@Bean
	TrainingAnalysisPolicy trainingAnalysisPolicy() {
		return new TrainingAnalysisPolicy();
	}

	@Bean
	TrainingAnalysisCostGuard trainingAnalysisCostGuard(Clock clock,
			@Value("${app.ai.daily-token-limit:10000}") int dailyTokenLimit) {
		return new TrainingAnalysisCostGuard(clock, dailyTokenLimit);
	}

	@Bean
	TrainingAnalysisGateway trainingAnalysisGateway(TrainingAnalysisPolicy policy,
			TrainingAnalysisCache cache, TrainingAnalysisCostGuard costGuard) {
		return new TrainingAnalysisGateway(List.of(), policy, cache, costGuard);
	}

	@Bean
	@Qualifier("trainingAiExecutor")
	Executor trainingAiExecutor() {
		ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
		executor.setCorePoolSize(1);
		executor.setMaxPoolSize(2);
		executor.setQueueCapacity(32);
		executor.setThreadNamePrefix("training-ai-");
		executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
		executor.initialize();
		return executor;
	}
}
