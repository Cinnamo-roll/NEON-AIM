import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Crosshair,
  AtSign,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Focus,
  KeyRound,
  LogOut,
  Mail,
  Orbit,
  Palette,
  Radar,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  type AccentColor,
  type AvatarPreset,
  type ProfileVisibility,
  type UpdateProfileInput,
} from "./authApi";
import { useAuthStore } from "./authStore";
import { getPasswordChangeIssue, type PasswordChangeIssue } from "./profileValidation";
import { tx } from "../../i18n";
import "./profileWorkspace.css";

type AuthMode = "login" | "register";
type ProfileTab = "career" | "identity" | "account";

const gameOptions = [
  ["", "暂未设置"],
  ["valorant", "VALORANT"],
  ["cs2", "Counter-Strike 2"],
  ["apex", "Apex Legends"],
  ["overwatch-2", "Overwatch 2"],
  ["call-of-duty", "Call of Duty"],
  ["fortnite", "Fortnite"],
  ["rainbow-six", "Rainbow Six"],
  ["pubg", "PUBG"],
  ["delta-force", "Delta Force"],
  ["crossfire", "CrossFire"],
] as const;

const avatarOptions: Array<{ id: AvatarPreset; icon: LucideIcon }> = [
  { id: "pulse", icon: Crosshair },
  { id: "vanguard", icon: Focus },
  { id: "orbit", icon: Orbit },
  { id: "nova", icon: Radar },
];

const cardOptions: AccentColor[] = ["cyan", "violet", "amber", "emerald"];

const regionOptions = [
  ["", "暂未设置"],
  ["CN", "中国大陆"],
  ["HK", "中国香港"],
  ["TW", "中国台湾"],
  ["SG", "新加坡"],
  ["JP", "日本"],
  ["KR", "韩国"],
  ["NA", "北美"],
  ["EU", "欧洲"],
] as const;

const englishRegions: Record<string, string> = {
  "": "Not set", CN: "Mainland China", HK: "Hong Kong", TW: "Taiwan", SG: "Singapore", JP: "Japan", KR: "South Korea", NA: "North America", EU: "Europe",
};

const optionLabel = (value: string, label: string) => value === "" ? tx(label, "Not set") : label;
const regionLabel = (value: string, label: string) => tx(label, englishRegions[value] ?? label);

function SecretInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="secret-input">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? tx("隐藏密码", "Hide password") : tx("显示密码", "Show password")}>
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
  );
}

function FeedbackBanner({ floating = false }: { floating?: boolean }) {
  const error = useAuthStore((state) => state.error);
  const notice = useAuthStore((state) => state.notice);
  const clear = useAuthStore((state) => state.clearFeedback);
  useEffect(() => {
    if (!floating || !notice) return;
    const timer = window.setTimeout(clear, 3800);
    return () => window.clearTimeout(timer);
  }, [clear, floating, notice]);
  if (!error && !notice) return null;
  return (
    <motion.div className={`account-feedback ${floating ? "account-toast" : ""} ${error ? "error" : "success"}`} initial={{ opacity: 0, y: floating ? -12 : -6, x: floating ? 8 : 0 }} animate={{ opacity: 1, y: 0, x: 0 }} exit={{ opacity: 0, y: -8 }} role="status">
      {error ? <X size={16} /> : <Check size={16} />}
      <span>{error ?? notice}</span>
      <button type="button" onClick={clear} aria-label={tx("关闭提示", "Dismiss message")}><X size={14} /></button>
    </motion.div>
  );
}

export function ConfirmationDialog({
  icon: Icon,
  title,
  description,
  confirmLabel,
  tone = "warning",
  busy = false,
  onCancel,
  onConfirm,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "warning" | "danger";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div
      className="account-dialog-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}
    >
      <motion.section
        className={`account-dialog confirmation-dialog tone-${tone}`}
        initial={{ scale: .97, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: .97, opacity: 0, y: 8 }}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <button type="button" className="dialog-close" onClick={onCancel} disabled={busy} aria-label={tx("关闭", "Close")}><X size={17} /></button>
        <span className="dialog-danger-icon"><Icon size={24} /></span>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={busy}>{tx("取消", "Cancel")}</button>
          <button type="button" className="dialog-confirm" onClick={onConfirm} disabled={busy}>{busy ? tx("正在处理…", "Processing…") : confirmLabel}</button>
        </div>
      </motion.section>
    </motion.div>
  );
}

function AuthGateway() {
  const status = useAuthStore((state) => state.status);
  const busyAction = useAuthStore((state) => state.busyAction);
  const fieldErrors = useAuthStore((state) => state.fieldErrors);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const clearFeedback = useAuthStore((state) => state.clearFeedback);
  const [mode, setMode] = useState<AuthMode>("login");
  const [identifier, setIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setLocalError(null);
    clearFeedback();
  };

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError(null);
    await login(identifier.trim(), loginPassword);
  };

  const submitRegistration = async (event: FormEvent) => {
    event.preventDefault();
    if (registerPassword !== confirmPassword) {
      setLocalError(tx("两次输入的密码不一致", "The passwords do not match"));
      return;
    }
    setLocalError(null);
    await register({
      username: username.trim(),
      displayName: displayName.trim() || undefined,
      email: email.trim(),
      password: registerPassword,
    });
  };

  return (
    <div className={`auth-gateway auth-mode-${mode}`}>
      <motion.section
        className={`auth-console mode-${mode}`}
        initial={{ opacity: 0, x: 18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="auth-entry">
          <header className="auth-heading">
            <span>{mode === "login" ? tx("玩家账户", "Player account") : tx("新玩家", "New player")}</span>
            <h1>{mode === "login" ? tx("继续训练", "Continue training") : tx("创建账户", "Create account")}</h1>
          </header>
          <div className="auth-tabs" role="tablist" aria-label={tx("账户操作", "Account actions")}>
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")} role="tab" aria-selected={mode === "login"}>
              {mode === "login" && <motion.i className="auth-tab-indicator" layoutId="auth-tab-indicator" transition={{ duration: 0.2 }} />}
              <span>{tx("登录", "Sign in")}</span>
            </button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")} role="tab" aria-selected={mode === "register"}>
              {mode === "register" && <motion.i className="auth-tab-indicator" layoutId="auth-tab-indicator" transition={{ duration: 0.2 }} />}
              <span>{tx("注册", "Register")}</span>
            </button>
          </div>
          {status === "offline" && <div className="auth-service-warning" role="status"><i />{tx("连接中断，正在重试", "Connection lost. Retrying…")}</div>}
          <FeedbackBanner />
          {localError && <div className="account-feedback error"><X size={16} /><span>{localError}</span></div>}

          <AnimatePresence mode="wait" initial={false}>
            {mode === "login" ? (
              <motion.form key="login" className="auth-form" onSubmit={submitLogin} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2, ease: "easeOut" }}>
              <label htmlFor="login-identifier"><span>{tx("用户名或邮箱", "Username or email")}</span><AtSign size={15} /></label>
              <input id="login-identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder={tx("输入用户名或邮箱", "Enter username or email")} autoComplete="username" required />
              <label htmlFor="login-password"><span>{tx("密码", "Password")}</span><KeyRound size={15} /></label>
              <SecretInput id="login-password" value={loginPassword} onChange={setLoginPassword} placeholder={tx("输入密码", "Enter password")} autoComplete="current-password" />
              <button className="auth-submit" disabled={busyAction !== null}>
                {busyAction === "login" ? tx("正在登录…", "Signing in…") : <>{tx("进入训练中枢", "Enter training lobby")} <ChevronRight size={17} /></>}
              </button>
              </motion.form>
            ) : (
              <motion.form key="register" className="auth-form register" onSubmit={submitRegistration} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2, ease: "easeOut" }}>
              <div className="auth-form-row">
                <span><label htmlFor="register-username">{tx("用户名", "Username")}</label><input id="register-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder={tx("例如 pilot_01", "e.g. pilot_01")} autoComplete="username" required /><small>{fieldErrors.username}</small></span>
                <span><label htmlFor="register-display-name">{tx("玩家名称", "Player name")}</label><input id="register-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={tx("可选", "Optional")} autoComplete="nickname" /><small>{fieldErrors.displayName}</small></span>
              </div>
              <label htmlFor="register-email"><span>{tx("邮箱", "Email")}</span><Mail size={15} /></label>
              <input id="register-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" required />
              <small className="field-error">{fieldErrors.email}</small>
              <div className="auth-form-row">
                <span><label htmlFor="register-password">{tx("密码", "Password")}</label><SecretInput id="register-password" value={registerPassword} onChange={setRegisterPassword} placeholder={tx("至少 8 位", "At least 8 characters")} autoComplete="new-password" /></span>
                <span><label htmlFor="register-confirm">{tx("确认密码", "Confirm password")}</label><SecretInput id="register-confirm" value={confirmPassword} onChange={setConfirmPassword} placeholder={tx("再次输入密码", "Enter password again")} autoComplete="new-password" /></span>
              </div>
              <small className="password-rule">{tx("密码需同时包含字母和数字。", "Password must include letters and numbers.")}</small>
              <button className="auth-submit" disabled={busyAction !== null}>
                {busyAction === "register" ? tx("正在注册…", "Creating account…") : <>{tx("创建账户", "Create account")} <ChevronRight size={17} /></>}
              </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.section>
    </div>
  );
}

export function PlayerAvatar({ displayName, preset, size = "regular" }: { displayName: string; preset: AvatarPreset; size?: "regular" | "large" | "choice" }) {
  const selectedPreset = avatarOptions.find((option) => option.id === preset) ?? avatarOptions[0];
  const AvatarIcon = selectedPreset.icon;
  return (
    <div className={`profile-avatar preset-${preset} avatar-${size}`} aria-label={`${displayName} ${tx("的头像", "avatar")}`}>
      <AvatarIcon className="avatar-line-icon" aria-hidden="true" />
    </div>
  );
}

function ProfileOverview() {
  return (
    <motion.section className="profile-career-empty" aria-label={tx("生涯模块待开发", "Career module coming soon")} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <span><Activity size={24} /></span>
      <small>CAREER MODULE</small>
      <h2>{tx("生涯模块", "Career module")}</h2>
      <p>{tx("待开发", "Coming soon")}</p>
    </motion.section>
  );
}

function ProfileEditor({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const user = useAuthStore((state) => state.user)!;
  const busy = useAuthStore((state) => state.busyAction);
  const fieldErrors = useAuthStore((state) => state.fieldErrors);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const initialForm = useMemo<UpdateProfileInput>(() => ({
    displayName: user.displayName,
    bio: user.bio,
    avatarPreset: user.avatarPreset,
    accentColor: user.accentColor,
    preferredGame: user.preferredGame ?? "",
    regionCode: user.regionCode ?? "",
    profileVisibility: user.profileVisibility,
  }), [user]);
  const [form, setForm] = useState<UpdateProfileInput>(initialForm);

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm]);

  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const setValue = <K extends keyof UpdateProfileInput>(key: K, value: UpdateProfileInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const currentDisplayName = String(form.displayName ?? user.displayName);
  const currentPreset = (form.avatarPreset ?? user.avatarPreset) as AvatarPreset;
  const currentAccent = (form.accentColor ?? user.accentColor) as AccentColor;

  return (
    <motion.form className="profile-editor" onSubmit={(event) => { event.preventDefault(); void updateProfile(form); }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <section className="profile-editor-card identity-style-card">
        <div className="profile-section-heading"><div><h2>{tx("头像与名片", "Avatar and player card")}</h2></div><Palette size={21} /></div>
        <fieldset>
          <legend>{tx("选择头像", "Choose avatar")}</legend>
          <div className="avatar-choice-grid">
            {avatarOptions.map((option, index) => (
              <button type="button" key={option.id} className={currentPreset === option.id ? "selected" : ""} onClick={() => setValue("avatarPreset", option.id)} aria-pressed={currentPreset === option.id} aria-label={`${tx("选择头像", "Select avatar")} ${index + 1}`}>
                <PlayerAvatar displayName={currentDisplayName} preset={option.id} size="choice" />
                {currentPreset === option.id && <Check size={14} />}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>{tx("选择名片", "Choose player card")}</legend>
          <div className="profile-card-choice-grid">
            {cardOptions.map((option, index) => (
              <button type="button" key={option} className={`accent-${option} ${currentAccent === option ? "selected" : ""}`} onClick={() => setValue("accentColor", option)} aria-pressed={currentAccent === option} aria-label={`${tx("选择名片", "Select player card")} ${index + 1}`}>
                <span className="profile-card-sample">
                  <PlayerAvatar displayName={currentDisplayName} preset={currentPreset} size="choice" />
                  <span className="profile-card-sample-identity"><b>{currentDisplayName || user.username}</b><span>@{user.username}</span></span>
                </span>
                {currentAccent === option && <Check size={13} />}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="profile-style-future-note">{tx("更多头像和名片将在后续更新中加入", "More avatars and player cards will be added in future updates")}</p>
      </section>
      <section className="profile-editor-card profile-fields-card">
        <div className="profile-section-heading"><div><h2>{tx("基本资料", "Basic profile")}</h2></div><UserRound size={21} /></div>
        <div className="profile-field-grid">
          <label><span>{tx("玩家名称", "Player name")}</span><input value={form.displayName ?? ""} onChange={(event) => setValue("displayName", event.target.value)} maxLength={24} /><small>{fieldErrors.displayName}</small></label>
          <label><span>{tx("常玩游戏", "Preferred game")}</span><select value={form.preferredGame ?? ""} onChange={(event) => setValue("preferredGame", event.target.value)}>{gameOptions.map(([value, label]) => <option key={value} value={value}>{optionLabel(value, label)}</option>)}</select></label>
          <label><span>{tx("地区", "Region")}</span><select value={form.regionCode ?? ""} onChange={(event) => setValue("regionCode", event.target.value)}>{regionOptions.map(([value, label]) => <option key={value} value={value}>{regionLabel(value, label)}</option>)}</select></label>
          <label><span>{tx("可见范围", "Visibility")}</span><select value={form.profileVisibility ?? "PUBLIC"} onChange={(event) => setValue("profileVisibility", event.target.value as ProfileVisibility)}><option value="PUBLIC">{tx("公开", "Public")}</option><option value="FRIENDS">{tx("仅好友", "Friends only")}</option><option value="PRIVATE">{tx("私密", "Private")}</option></select></label>
          <label className="bio-field"><span>{tx("个人简介", "Bio")} <small>{String(form.bio ?? "").length} / 160</small></span><textarea value={form.bio ?? ""} onChange={(event) => setValue("bio", event.target.value)} maxLength={160} placeholder={tx("简单介绍一下自己", "A short introduction about yourself")} /><small>{fieldErrors.bio}</small></label>
        </div>
        <div className="profile-save-row"><span className={dirty ? "dirty" : ""}><i />{dirty ? tx("有未保存的修改", "Unsaved changes") : tx("资料已保存", "Profile saved")}</span><button className="save-profile" disabled={busy !== null || !dirty}><Save size={17} />{busy === "profile" ? tx("正在保存…", "Saving…") : dirty ? tx("保存修改", "Save changes") : tx("已保存", "Saved")}</button></div>
      </section>
    </motion.form>
  );
}

function SecurityCenter() {
  const busy = useAuthStore((state) => state.busyAction);
  const changePassword = useAuthStore((state) => state.changePassword);
  const logout = useAuthStore((state) => state.logout);
  const logoutAll = useAuthStore((state) => state.logoutAll);
  const deleteAccount = useAuthStore((state) => state.deleteAccount);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [sessionAction, setSessionAction] = useState<"logout" | "logoutAll" | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const passwordIssueMessage = (issue: Exclude<PasswordChangeIssue, null>) => ({
    missing: tx("请填写当前密码、新密码和确认密码", "Enter the current password, new password, and confirmation"),
    mismatch: tx("两次输入的新密码不一致", "The new passwords do not match"),
    length: tx("新密码需为 8–64 个字符", "The new password must be 8–64 characters"),
    weak: tx("新密码需同时包含字母和数字", "The new password must include letters and numbers"),
    unchanged: tx("新密码不能与当前密码相同", "The new password must be different from the current password"),
  })[issue];

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    const issue = getPasswordChangeIssue(currentPassword, newPassword, confirmPassword);
    if (issue) {
      setLocalError(passwordIssueMessage(issue));
      return;
    }
    setLocalError(null);
    if (await changePassword(currentPassword, newPassword)) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const confirmDelete = async (event: FormEvent) => {
    event.preventDefault();
    if (await deleteAccount(deletePassword)) {
      setDeleteOpen(false);
      setDeletePassword("");
    }
  };

  const confirmSessionAction = () => {
    const action = sessionAction;
    setSessionAction(null);
    if (action === "logout") void logout();
    if (action === "logoutAll") void logoutAll();
  };

  return (
    <motion.div className="security-center" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <form className="security-card password-card" onSubmit={submitPassword}>
        <div className="profile-section-heading"><div><h2>{tx("修改密码", "Change password")}</h2></div><KeyRound size={22} /></div>
        {localError && <div className="account-feedback error"><X size={15} /><span>{localError}</span></div>}
        <label htmlFor="current-password">{tx("当前密码", "Current password")}</label><SecretInput id="current-password" value={currentPassword} onChange={(value) => { setCurrentPassword(value); setLocalError(null); }} placeholder={tx("输入当前密码", "Enter current password")} autoComplete="current-password" />
        <div className="password-pair"><span><label htmlFor="new-password">{tx("新密码", "New password")}</label><SecretInput id="new-password" value={newPassword} onChange={(value) => { setNewPassword(value); setLocalError(null); }} placeholder={tx("输入新密码", "Enter a new password")} autoComplete="new-password" /></span><span><label htmlFor="confirm-new-password">{tx("确认新密码", "Confirm new password")}</label><SecretInput id="confirm-new-password" value={confirmPassword} onChange={(value) => { setConfirmPassword(value); setLocalError(null); }} placeholder={tx("再次输入新密码", "Enter the new password again")} autoComplete="new-password" /></span></div>
        <small className="password-rule security-password-rule">{tx("密码需为 8–64 个字符，并同时包含字母和数字。", "Use 8–64 characters with both letters and numbers.")}</small>
        <button className="security-primary" disabled={busy !== null}><ShieldCheck size={16} />{busy === "password" ? tx("正在更新…", "Updating…") : tx("更新账户密码", "Update account password")}</button>
      </form>
      <section className="security-card session-security-card">
        <div className="profile-section-heading"><div><h2>{tx("登录管理", "Session management")}</h2></div><LogOut size={22} /></div>
        <div className="session-actions"><button type="button" onClick={() => setSessionAction("logout")} disabled={busy !== null}><LogOut size={16} /><span><b>{tx("退出当前设备", "Sign out this device")}</b><small>{tx("仅结束本机登录", "End this session only")}</small></span></button><button type="button" onClick={() => setSessionAction("logoutAll")} disabled={busy !== null}><UsersRound size={16} /><span><b>{tx("退出所有设备", "Sign out all devices")}</b><small>{tx("撤销全部登录会话", "Revoke every session")}</small></span></button></div>
      </section>
      <section className="security-card danger-card">
        <div><Trash2 size={22} /><span><h2>{tx("注销账户", "Delete account")}</h2><p>{tx("永久删除账户和全部登录会话。", "Permanently delete the account and all sessions.")}</p></span></div>
        <button type="button" onClick={() => setDeleteOpen(true)}>{tx("注销我的账户", "Delete my account")}</button>
      </section>
      <AnimatePresence>
        {sessionAction && <ConfirmationDialog icon={sessionAction === "logout" ? LogOut : UsersRound} title={sessionAction === "logout" ? tx("退出当前设备？", "Sign out this device?") : tx("退出所有设备？", "Sign out all devices?")} description={sessionAction === "logout" ? tx("你将返回登录页，本机保存的训练设置不会受到影响。", "You will return to sign in. Local training settings will be kept.") : tx("所有设备上的登录状态都会立即失效，需要重新输入账号和密码。", "Every session will end immediately and require a fresh sign-in.")} confirmLabel={sessionAction === "logout" ? tx("确认退出", "Sign out") : tx("退出所有设备", "Sign out all devices")} onCancel={() => setSessionAction(null)} onConfirm={confirmSessionAction} busy={busy !== null} />}
        {deleteOpen && <motion.div className="account-dialog-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteOpen(false); }}><motion.form className="account-dialog tone-danger" onSubmit={confirmDelete} initial={{ scale: .97, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: .97, opacity: 0, y: 8 }} role="alertdialog" aria-modal="true" aria-label={tx("确认注销账户", "Confirm account deletion")}><button type="button" className="dialog-close" onClick={() => setDeleteOpen(false)} aria-label={tx("关闭", "Close")}><X size={17} /></button><span className="dialog-danger-icon"><Trash2 size={25} /></span><h2>{tx("确认永久注销账户", "Permanently delete account")}</h2><p>{tx("请输入当前密码继续。注销后账户无法恢复，所有设备会立即退出。", "Enter your current password. This cannot be undone and all devices will sign out.")}</p><label htmlFor="delete-password">{tx("当前密码", "Current password")}</label><SecretInput id="delete-password" value={deletePassword} onChange={setDeletePassword} placeholder={tx("输入当前密码", "Enter current password")} autoComplete="current-password" /><div className="dialog-actions"><button type="button" onClick={() => setDeleteOpen(false)}>{tx("取消", "Cancel")}</button><button className="confirm-delete" disabled={busy !== null}>{busy === "delete" ? tx("正在注销…", "Deleting…") : tx("永久注销", "Delete permanently")}</button></div></motion.form></motion.div>}
      </AnimatePresence>
    </motion.div>
  );
}

function AuthenticatedProfile() {
  const user = useAuthStore((state) => state.user)!;
  const [tab, setTab] = useState<ProfileTab>("career");
  const [profileDirty, setProfileDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<ProfileTab | null>(null);
  const requestTab = (next: ProfileTab) => {
    if (next === tab) return;
    if (tab === "identity" && profileDirty) {
      setPendingTab(next);
      return;
    }
    setTab(next);
  };
  return (
    <div className="authenticated-profile">
      <section className={`profile-command-card accent-${user.accentColor}`}>
        <div className="profile-scanline" />
        <PlayerAvatar displayName={user.displayName} preset={user.avatarPreset} size="large" />
        <div className="profile-identity-copy">
          <h1>{user.displayName}</h1>
          <p>@{user.username}<i />{(() => { const option = gameOptions.find(([id]) => id === user.preferredGame); return option ? optionLabel(option[0], option[1]) : tx("未设置常玩游戏", "No preferred game"); })()}</p>
        </div>
      </section>
      <FeedbackBanner floating />
      <nav className="profile-tabs" aria-label={tx("个人档案导航", "Player profile navigation")}>
        <button className={tab === "career" ? "active" : ""} onClick={() => requestTab("career")}><Activity size={17} /><span><b>{tx("生涯", "Career")}</b></span></button>
        <button className={tab === "identity" ? "active" : ""} onClick={() => requestTab("identity")}><UserRound size={17} /><span><b>{tx("资料", "Profile")}</b></span>{profileDirty && <i />}</button>
        <button className={tab === "account" ? "active" : ""} onClick={() => requestTab("account")}><ShieldCheck size={17} /><span><b>{tx("安全", "Security")}</b></span></button>
      </nav>
      <AnimatePresence mode="wait">
        <div key={tab}>{tab === "career" ? <ProfileOverview /> : tab === "identity" ? <ProfileEditor onDirtyChange={setProfileDirty} /> : <SecurityCenter />}</div>
        {pendingTab && <ConfirmationDialog icon={Palette} title={tx("放弃未保存的修改？", "Discard unsaved changes?")} description={tx("你对头像、名片或资料的修改还没有保存，离开后这些修改会丢失。", "Your avatar, card, or profile changes have not been saved and will be lost.")} confirmLabel={tx("放弃修改", "Discard changes")} tone="danger" onCancel={() => setPendingTab(null)} onConfirm={() => { const next = pendingTab; setPendingTab(null); setProfileDirty(false); setTab(next); }} />}
      </AnimatePresence>
    </div>
  );
}

export function ProfileWorkspace() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  if (status === "loading") {
    return <div className="identity-loading"><span><i /></span><h2>{tx("正在登录…", "Signing in…")}</h2></div>;
  }
  return user && status === "authenticated" ? <AuthenticatedProfile /> : <AuthGateway />;
}
