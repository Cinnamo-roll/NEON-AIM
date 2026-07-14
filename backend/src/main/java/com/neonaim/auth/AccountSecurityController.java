package com.neonaim.auth;

import com.neonaim.auth.AuthService.AuthSession;
import com.neonaim.auth.AuthService.SessionTokens;
import com.neonaim.common.api.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
class AccountSecurityController {

	private final AuthService authService;
	private final AuthController authController;

	AccountSecurityController(AuthService authService, AuthController authController) {
		this.authService = authService;
		this.authController = authController;
	}

	@PostMapping("/auth/password")
	ApiResponse<AuthSession> changePassword(
			@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody ChangePasswordRequest request,
			HttpServletRequest servletRequest,
			HttpServletResponse response) {
		SessionTokens tokens = authService.changePassword(userId(jwt), request.currentPassword(),
				request.newPassword(), AuthController.client(servletRequest));
		authController.writeRefreshCookie(response, tokens.refreshToken());
		return ApiResponse.success(tokens.session(), "密码已更新，其他设备已退出");
	}

	@PostMapping("/auth/logout-all")
	ApiResponse<Boolean> logoutAll(@AuthenticationPrincipal Jwt jwt, HttpServletResponse response) {
		authService.logoutAll(userId(jwt));
		authController.clearRefreshCookie(response);
		return ApiResponse.success(Boolean.TRUE, "所有设备均已退出");
	}

	@DeleteMapping("/users/me")
	ApiResponse<Boolean> deleteAccount(
			@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody DeleteAccountRequest request,
			HttpServletResponse response) {
		authService.deleteAccount(userId(jwt), request.password());
		authController.clearRefreshCookie(response);
		return ApiResponse.success(Boolean.TRUE, "账户已注销");
	}

	private static UUID userId(Jwt jwt) {
		return UUID.fromString(jwt.getSubject());
	}

	record ChangePasswordRequest(
			@NotBlank(message = "请输入当前密码") String currentPassword,
			@NotBlank(message = "请输入新密码")
			@Size(min = 8, max = 64, message = "新密码需为 8–64 个字符") String newPassword) {
	}

	record DeleteAccountRequest(@NotBlank(message = "请输入当前密码") String password) {
	}
}
