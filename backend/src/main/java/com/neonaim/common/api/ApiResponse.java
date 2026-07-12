package com.neonaim.common.api;

public record ApiResponse<T>(T data, String message) {

	public static <T> ApiResponse<T> success(T data) {
		return new ApiResponse<>(data, null);
	}

	public static <T> ApiResponse<T> success(T data, String message) {
		return new ApiResponse<>(data, message);
	}
}
