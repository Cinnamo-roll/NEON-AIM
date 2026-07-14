package com.neonaim.common.error;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.dao.DataIntegrityViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

	private static final Logger LOGGER = LoggerFactory.getLogger(ApiExceptionHandler.class);

	@ExceptionHandler(ApiException.class)
	ProblemDetail handleApiException(ApiException exception, HttpServletRequest request) {
		ProblemDetail detail = ProblemDetail.forStatusAndDetail(exception.status(), exception.getMessage());
		detail.setTitle("请求未完成");
		detail.setInstance(URI.create(request.getRequestURI()));
		detail.setProperty("code", exception.code());
		return detail;
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	ProblemDetail handleValidation(MethodArgumentNotValidException exception, HttpServletRequest request) {
		ProblemDetail detail = ProblemDetail.forStatusAndDetail(
				HttpStatus.BAD_REQUEST,
				exception.getBindingResult().getAllErrors().getFirst().getDefaultMessage());
		detail.setTitle("请求参数无效");
		detail.setInstance(URI.create(request.getRequestURI()));
		Map<String, String> fields = new LinkedHashMap<>();
		exception.getBindingResult().getFieldErrors().forEach(error ->
				fields.putIfAbsent(error.getField(), error.getDefaultMessage()));
		detail.setProperty("code", "VALIDATION_FAILED");
		detail.setProperty("fields", fields);
		return detail;
	}

	@ExceptionHandler(HttpMessageNotReadableException.class)
	ProblemDetail handleUnreadableRequest(HttpMessageNotReadableException exception, HttpServletRequest request) {
		ProblemDetail detail = ProblemDetail.forStatusAndDetail(
				HttpStatus.BAD_REQUEST,
				"请求内容格式无效，请刷新页面后重试");
		detail.setTitle("请求参数无效");
		detail.setInstance(URI.create(request.getRequestURI()));
		detail.setProperty("code", "INVALID_JSON");
		return detail;
	}

	@ExceptionHandler(DataIntegrityViolationException.class)
	ProblemDetail handleConflict(DataIntegrityViolationException exception, HttpServletRequest request) {
		ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "该用户名或邮箱已被使用");
		detail.setTitle("账户信息冲突");
		detail.setInstance(URI.create(request.getRequestURI()));
		detail.setProperty("code", "ACCOUNT_CONFLICT");
		return detail;
	}

	@ExceptionHandler(AccessDeniedException.class)
	ProblemDetail handleAccessDenied(AccessDeniedException exception, HttpServletRequest request) {
		ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "当前账户无权执行该操作");
		detail.setTitle("访问被拒绝");
		detail.setInstance(URI.create(request.getRequestURI()));
		detail.setProperty("code", "ACCESS_DENIED");
		return detail;
	}

	@ExceptionHandler(Exception.class)
	ProblemDetail handleUnexpected(Exception exception, HttpServletRequest request) {
		LOGGER.error("Unhandled API exception for {}", request.getRequestURI(), exception);
		ProblemDetail detail = ProblemDetail.forStatusAndDetail(
				HttpStatus.INTERNAL_SERVER_ERROR,
				"身份服务暂时不可用，请稍后重试");
		detail.setTitle("服务处理失败");
		detail.setInstance(URI.create(request.getRequestURI()));
		detail.setProperty("code", "INTERNAL_ERROR");
		return detail;
	}
}
