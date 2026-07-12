package com.neonaim.common.error;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

	@ExceptionHandler(MethodArgumentNotValidException.class)
	ProblemDetail handleValidation(MethodArgumentNotValidException exception, HttpServletRequest request) {
		ProblemDetail detail = ProblemDetail.forStatusAndDetail(
				HttpStatus.BAD_REQUEST,
				exception.getBindingResult().getAllErrors().getFirst().getDefaultMessage());
		detail.setTitle("请求参数无效");
		detail.setInstance(URI.create(request.getRequestURI()));
		return detail;
	}
}
