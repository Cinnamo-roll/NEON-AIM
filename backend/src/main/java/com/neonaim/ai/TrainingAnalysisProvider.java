package com.neonaim.ai;

import java.util.List;
import java.util.Map;

public interface TrainingAnalysisProvider {

	AnalysisResult analyze(AnalysisRequest request);

	String providerId();

	record AnalysisRequest(String userId, String sessionId, Map<String, Number> metrics) {
	}

	record AnalysisResult(String summary, List<String> suggestions, String model) {
	}
}
