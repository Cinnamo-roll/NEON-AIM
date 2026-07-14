package com.neonaim.auth;

import com.neonaim.auth.AuthService.AuthSession;
import com.neonaim.auth.AuthService.ClientMetadata;
import com.neonaim.auth.AuthService.SessionTokens;
import com.neonaim.common.api.ApiResponse;
import com.neonaim.common.error.ApiException;
import com.neonaim.user.api.UserAccountOperations.RegisterCommand;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
class AuthController {

	private final AuthService authService;
	private final AuthProperties properties;

	AuthController(AuthService authService, AuthProperties properties) {
		this.authService = authService;
		this.properties = properties;
	}

	@PostMapping("/register")
	ResponseEntity<ApiResponse<AuthSession>> register(
			@Valid @RequestBody RegisterRequest request,
			HttpServletRequest servletRequest,
			HttpServletResponse response) {
		SessionTokens tokens = authService.register(request.toCommand(), client(servletRequest));
		writeRefreshCookie(response, tokens.refreshToken());
		return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(tokens.session(), "账户创建成功"));
	}

	@PostMapping("/login")
	ApiResponse<AuthSession> login(
			@Valid @RequestBody LoginRequest request,
			HttpServletRequest servletRequest,
			HttpServletResponse response) {
		SessionTokens tokens = authService.login(request.identifier(), request.password(), client(servletRequest));
		writeRefreshCookie(response, tokens.refreshToken());
		return ApiResponse.success(tokens.session(), "欢迎回来");
	}

	@PostMapping("/refresh")
	ApiResponse<AuthSession> refresh(
			@CookieValue(name = "neon_refresh", required = false) String refreshToken,
			@RequestHeader(name = "X-Requested-With", required = false) String requestedWith,
			HttpServletRequest servletRequest,
			HttpServletResponse response) {
		requireSpaRequest(requestedWith);
		SessionTokens tokens = authService.refresh(refreshToken, client(servletRequest));
		writeRefreshCookie(response, tokens.refreshToken());
		return ApiResponse.success(tokens.session());
	}

	@PostMapping("/logout")
	ApiResponse<Boolean> logout(
			@CookieValue(name = "neon_refresh", required = false) String refreshToken,
			@RequestHeader(name = "X-Requested-With", required = false) String requestedWith,
			HttpServletResponse response) {
		requireSpaRequest(requestedWith);
		authService.logout(refreshToken);
		clearRefreshCookie(response);
		return ApiResponse.success(Boolean.TRUE, "已安全退出");
	}

	void writeRefreshCookie(HttpServletResponse response, String refreshToken) {
		ResponseCookie cookie = ResponseCookie.from(properties.refreshCookieName(), refreshToken)
				.httpOnly(true)
				.secure(properties.refreshCookieSecure())
				.sameSite("Strict")
				.path("/api/auth")
				.maxAge(properties.refreshTokenTtl())
				.build();
		response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
	}

	void clearRefreshCookie(HttpServletResponse response) {
		ResponseCookie cookie = ResponseCookie.from(properties.refreshCookieName(), "")
				.httpOnly(true)
				.secure(properties.refreshCookieSecure())
				.sameSite("Strict")
				.path("/api/auth")
				.maxAge(0)
				.build();
		response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
	}

	static ClientMetadata client(HttpServletRequest request) {
		return new ClientMetadata(limit(request.getHeader("User-Agent"), 255), limit(request.getRemoteAddr(), 64));
	}

	static void requireSpaRequest(String requestedWith) {
		if (!"NEON-AIM".equals(requestedWith)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "SPA_HEADER_REQUIRED", "缺少客户端请求标识");
		}
	}

	private static String limit(String value, int maximum) {
		return value == null ? null : value.substring(0, Math.min(maximum, value.length()));
	}

	record RegisterRequest(
			@NotBlank(message = "用户名不能为空")
			@Pattern(regexp = "[A-Za-z0-9_]{3,20}", message = "用户名需为 3–20 位字母、数字或下划线") String username,
			@NotBlank(message = "邮箱不能为空")
			@Email(message = "请输入有效的邮箱地址")
			@Size(max = 254, message = "邮箱地址过长") String email,
			@NotBlank(message = "密码不能为空")
			@Size(min = 8, max = 64, message = "密码需为 8–64 个字符") String password,
			@Size(min = 2, max = 24, message = "玩家名称需为 2–24 个字符") String displayName) {

		RegisterCommand toCommand() {
			return new RegisterCommand(username, email, password, displayName);
		}
	}

	record LoginRequest(
			@NotBlank(message = "请输入用户名或邮箱") String identifier,
			@NotBlank(message = "请输入密码") String password) {
	}
}
