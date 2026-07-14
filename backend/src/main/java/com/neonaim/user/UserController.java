package com.neonaim.user;

import com.neonaim.common.api.ApiResponse;
import com.neonaim.user.api.UserAccountOperations;
import com.neonaim.user.api.UserAccountOperations.UpdateProfileCommand;
import com.neonaim.user.api.UserAccountOperations.UserProfile;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
class UserController {

	private final UserAccountOperations accounts;

	UserController(UserAccountOperations accounts) {
		this.accounts = accounts;
	}

	@GetMapping("/me")
	ApiResponse<UserProfile> me(@AuthenticationPrincipal Jwt jwt) {
		return ApiResponse.success(accounts.profile(UUID.fromString(jwt.getSubject())));
	}

	@PatchMapping("/me")
	ApiResponse<UserProfile> update(
			@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody UpdateProfileRequest request) {
		UserProfile profile = accounts.updateProfile(UUID.fromString(jwt.getSubject()), request.toCommand());
		return ApiResponse.success(profile, "个人档案已更新");
	}

	record UpdateProfileRequest(
			@Size(min = 2, max = 24, message = "玩家名称需为 2–24 个字符") String displayName,
			@Size(max = 160, message = "个人简介不能超过 160 个字符") String bio,
			@Pattern(regexp = "pulse|vanguard|orbit|nova", message = "头像预设无效") String avatarPreset,
			@Pattern(regexp = "cyan|violet|amber|emerald", message = "档案主题色无效") String accentColor,
			@Size(max = 32, message = "常玩游戏不能超过 32 个字符") String preferredGame,
			@Size(max = 16, message = "地区代码不能超过 16 个字符") String regionCode,
			@Pattern(regexp = "PUBLIC|FRIENDS|PRIVATE", message = "档案可见范围无效") String profileVisibility) {

		UpdateProfileCommand toCommand() {
			return new UpdateProfileCommand(displayName, bio, avatarPreset, accentColor,
					preferredGame, regionCode, profileVisibility);
		}
	}
}
