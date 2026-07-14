package com.neonaim.ai;

import java.util.Objects;

final class ModelProviderException extends RuntimeException {

	private static final long serialVersionUID = 1L;
	private final String code;
	private final int inputTokens;
	private final int outputTokens;

	ModelProviderException(String code, String message) {
		this(code, message, null, new TrainingAnalysisProvider.TokenUsage(0, 0));
	}

	ModelProviderException(String code, String message, Throwable cause) {
		this(code, message, cause, new TrainingAnalysisProvider.TokenUsage(0, 0));
	}

	ModelProviderException(String code, String message, Throwable cause,
		TrainingAnalysisProvider.TokenUsage usage) {
		super(message, cause);
		this.code = code;
		TrainingAnalysisProvider.TokenUsage safeUsage = Objects.requireNonNull(usage, "usage");
		this.inputTokens = safeUsage.inputTokens();
		this.outputTokens = safeUsage.outputTokens();
	}

	String code() {
		return code;
	}

	TrainingAnalysisProvider.TokenUsage usage() {
		return new TrainingAnalysisProvider.TokenUsage(inputTokens, outputTokens);
	}
}
