package com.neonaim.user;

import com.neonaim.common.error.ApiException;
import com.neonaim.user.api.UserAccountOperations;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class UserAccountService implements UserAccountOperations {

	private static final Pattern USERNAME_PATTERN = Pattern.compile("[A-Za-z0-9_]{3,20}");
	private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
	private static final Set<String> AVATAR_PRESETS = Set.of("pulse", "vanguard", "orbit", "nova");
	private static final Set<String> ACCENT_COLORS = Set.of("cyan", "violet", "amber", "emerald");

	private final UserAccountRepository repository;
	private final PasswordEncoder passwordEncoder;
	private final Clock clock;
	private final String dummyPasswordHash;

	UserAccountService(UserAccountRepository repository, PasswordEncoder passwordEncoder, Clock clock) {
		this.repository = repository;
		this.passwordEncoder = passwordEncoder;
		this.clock = clock;
		this.dummyPasswordHash = passwordEncoder.encode("neon-aim-dummy-password");
	}

	@Override
	@Transactional
	public UserIdentity register(RegisterCommand command) {
		String username = required(command.username(), "用户名不能为空");
		if (!USERNAME_PATTERN.matcher(username).matches()) {
			throw invalid("USERNAME_INVALID", "用户名需为 3–20 位字母、数字或下划线");
		}
		String email = normalizeEmail(command.email());
		ensurePasswordPolicy(command.password());
		String usernameNormalized = normalize(username);
		if (repository.existsByUsernameNormalized(usernameNormalized)) {
			throw conflict("USERNAME_TAKEN", "该用户名已被使用");
		}
		if (repository.existsByEmailNormalized(email)) {
			throw conflict("EMAIL_TAKEN", "该邮箱已被注册");
		}
		String displayName = optional(command.displayName(), username);
		ensureLength(displayName, 2, 24, "DISPLAY_NAME_INVALID", "玩家名称需为 2–24 个字符");
		Instant now = clock.instant();
		UserAccount account = new UserAccount(username, usernameNormalized, email, email,
				passwordEncoder.encode(command.password()), displayName, now);
		return identity(repository.save(account));
	}

	@Override
	public UserIdentity authenticate(String identifier, String password) {
		String normalizedIdentifier = normalize(required(identifier, "请输入用户名或邮箱"));
		Instant now = clock.instant();
		UserAccount account = repository
				.findByUsernameNormalizedOrEmailNormalized(normalizedIdentifier, normalizedIdentifier)
				.orElse(null);
		if (account == null || account.status() != UserAccount.Status.ACTIVE) {
			passwordEncoder.matches(password == null ? "" : password, dummyPasswordHash);
			throw unauthorized("INVALID_CREDENTIALS", "用户名、邮箱或密码不正确");
		}
		account.clearExpiredLock(now);
		if (account.lockedUntil() != null && account.lockedUntil().isAfter(now)) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "ACCOUNT_TEMPORARILY_LOCKED", "登录失败次数过多，请 15 分钟后重试");
		}
		if (password == null || !passwordEncoder.matches(password, account.passwordHash())) {
			account.recordFailedLogin(now);
			repository.save(account);
			throw unauthorized("INVALID_CREDENTIALS", "用户名、邮箱或密码不正确");
		}
		account.recordLogin(now);
		return identity(repository.save(account));
	}

	@Override
	@Transactional(readOnly = true)
	public UserIdentity identity(UUID userId) {
		return identity(activeAccount(userId));
	}

	@Override
	@Transactional(readOnly = true)
	public UserProfile profile(UUID userId) {
		return profile(activeAccount(userId));
	}

	@Override
	@Transactional
	public UserProfile updateProfile(UUID userId, UpdateProfileCommand command) {
		UserAccount account = activeAccount(userId);
		String displayName = command.displayName() == null ? account.displayName() : command.displayName().trim();
		String bio = command.bio() == null ? account.bio() : command.bio().trim();
		String avatarPreset = command.avatarPreset() == null ? account.avatarPreset() : command.avatarPreset();
		String accentColor = command.accentColor() == null ? account.accentColor() : command.accentColor();
		String preferredGame = command.preferredGame() == null ? account.preferredGame() : nullable(command.preferredGame());
		String regionCode = command.regionCode() == null ? account.regionCode() : nullable(command.regionCode());
		UserAccount.Visibility visibility = command.profileVisibility() == null
				? account.profileVisibility()
				: visibility(command.profileVisibility());
		ensureLength(displayName, 2, 24, "DISPLAY_NAME_INVALID", "玩家名称需为 2–24 个字符");
		ensureMaximum(bio, 160, "BIO_TOO_LONG", "个人简介不能超过 160 个字符");
		ensureMaximum(preferredGame, 32, "PREFERRED_GAME_TOO_LONG", "常玩游戏不能超过 32 个字符");
		ensureMaximum(regionCode, 16, "REGION_TOO_LONG", "地区代码不能超过 16 个字符");
		if (!AVATAR_PRESETS.contains(avatarPreset)) {
			throw invalid("AVATAR_PRESET_INVALID", "头像预设无效");
		}
		if (!ACCENT_COLORS.contains(accentColor)) {
			throw invalid("ACCENT_COLOR_INVALID", "档案主题色无效");
		}
		account.updateProfile(displayName, bio, avatarPreset, accentColor, preferredGame, regionCode, visibility, clock.instant());
		return profile(repository.save(account));
	}

	@Override
	@Transactional
	public UserIdentity changePassword(UUID userId, String currentPassword, String newPassword) {
		UserAccount account = activeAccount(userId);
		if (currentPassword == null || !passwordEncoder.matches(currentPassword, account.passwordHash())) {
			throw unauthorized("CURRENT_PASSWORD_INVALID", "当前密码不正确");
		}
		ensurePasswordPolicy(newPassword);
		if (passwordEncoder.matches(newPassword, account.passwordHash())) {
			throw invalid("PASSWORD_UNCHANGED", "新密码不能与当前密码相同");
		}
		account.changePassword(passwordEncoder.encode(newPassword), clock.instant());
		return identity(repository.save(account));
	}

	@Override
	@Transactional
	public void deleteAccount(UUID userId, String password) {
		UserAccount account = activeAccount(userId);
		if (password == null || !passwordEncoder.matches(password, account.passwordHash())) {
			throw unauthorized("CURRENT_PASSWORD_INVALID", "当前密码不正确");
		}
		account.delete(clock.instant());
		repository.save(account);
	}

	private UserAccount activeAccount(UUID userId) {
		UserAccount account = repository.findById(userId)
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "用户不存在"));
		if (account.status() != UserAccount.Status.ACTIVE) {
			throw new ApiException(HttpStatus.UNAUTHORIZED, "ACCOUNT_INACTIVE", "账户当前不可用");
		}
		return account;
	}

	private static UserIdentity identity(UserAccount account) {
		return new UserIdentity(account.id(), account.username(), account.displayName(), account.role().name());
	}

	private static UserProfile profile(UserAccount account) {
		return new UserProfile(account.id(), account.username(), account.email(), account.displayName(), account.bio(),
				account.avatarPreset(), account.accentColor(), account.preferredGame(), account.regionCode(),
				account.profileVisibility().name(), account.role().name(), account.createdAt(), account.lastLoginAt());
	}

	private static String required(String value, String message) {
		if (value == null || value.isBlank()) throw invalid("FIELD_REQUIRED", message);
		return value.trim();
	}

	private static String optional(String value, String fallback) {
		return value == null || value.isBlank() ? fallback : value.trim();
	}

	private static String nullable(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	private static String normalize(String value) {
		return value.trim().toLowerCase(Locale.ROOT);
	}

	private static String normalizeEmail(String value) {
		String email = normalize(required(value, "邮箱不能为空"));
		if (email.length() > 254 || !EMAIL_PATTERN.matcher(email).matches()) {
			throw invalid("EMAIL_INVALID", "请输入有效的邮箱地址");
		}
		return email;
	}

	private static UserAccount.Visibility visibility(String value) {
		try {
			return UserAccount.Visibility.valueOf(value.toUpperCase(Locale.ROOT));
		} catch (IllegalArgumentException exception) {
			throw invalid("PROFILE_VISIBILITY_INVALID", "档案可见范围无效");
		}
	}

	private static void ensurePasswordPolicy(String password) {
		if (password == null || password.length() < 8 || password.length() > 64
				|| password.chars().noneMatch(Character::isLetter)
				|| password.chars().noneMatch(Character::isDigit)) {
			throw invalid("PASSWORD_WEAK", "密码需为 8–64 个字符，并同时包含字母和数字");
		}
	}

	private static void ensureLength(String value, int minimum, int maximum, String code, String message) {
		if (value == null || value.length() < minimum || value.length() > maximum) throw invalid(code, message);
	}

	private static void ensureMaximum(String value, int maximum, String code, String message) {
		if (value != null && value.length() > maximum) throw invalid(code, message);
	}

	private static ApiException invalid(String code, String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, code, message);
	}

	private static ApiException conflict(String code, String message) {
		return new ApiException(HttpStatus.CONFLICT, code, message);
	}

	private static ApiException unauthorized(String code, String message) {
		return new ApiException(HttpStatus.UNAUTHORIZED, code, message);
	}
}
