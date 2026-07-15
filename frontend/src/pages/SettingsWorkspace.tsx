import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  CircleCheck,
  ChevronDown,
  ChevronUp,
  Copy,
  Crosshair as CrosshairIcon,
  Eye,
  EyeOff,
  KeyRound,
  Languages,
  MonitorCog,
  MousePointer2,
  PlugZap,
  RotateCcw,
  Shuffle,
  Undo2,
  Volume2,
} from "lucide-react";
import { TrainingCrosshair } from "../components/training/Crosshair";
import { GridShotSettingsPreview } from "../components/training/GridShotSettingsPreview";
import { GameIcon } from "../components/GameIcon";
import { interfaceAudio } from "../game/audio/interfaceAudio";
import {
  activeModelProvider,
  clearModelApiSettings,
  DEFAULT_MODEL_API_SETTINGS,
  MODEL_OPTIONS,
  MODEL_PROVIDERS,
  readModelApiSettings,
  type ModelProviderId,
  type ModelApiSettings,
} from "../game/analysis/modelApiSettings";
import {
  getAiProviderSettings,
  saveAiProviderSettings,
  type AiProviderSettingsView,
} from "../game/analysis/aiProviderSettingsService";
import {
  testModelProviderConnection,
  type ModelProviderConnectionResult,
} from "../game/analysis/modelProviderConnectionService";
import { useAuthStore } from "../features/auth/authStore";
import { tx } from "../i18n";
import { FPS_OPTIONS, type FpsLimit } from "../game/performance/frameRate";
import {
  canonicalFromProfile,
  gameProfilesForDisplay,
  profiles,
  roundSensitivity,
  sensitivityFromProfile,
} from "../game/sensitivity/sensitivity";
import {
  CATEGORY_DEFAULTS,
} from "../game/settings/trainingSettings";
import {
  applyCrosshairPreset,
  CROSSHAIR_PRESETS,
  type CrosshairPresetId,
} from "../game/settings/crosshairPresets";
import type { TrainingSettings } from "../game/types/training";

type Tab = "general" | "input" | "crosshair" | "display" | "audio";
type ChannelTestState = {
  status: "idle" | "testing" | "success" | "failed";
  fingerprint: string;
  result?: ModelProviderConnectionResult;
  message?: string;
};

function emptyModelApiSettings(): ModelApiSettings {
  return {
    activeProvider: DEFAULT_MODEL_API_SETTINGS.activeProvider,
    providers: {
      openai: { ...DEFAULT_MODEL_API_SETTINGS.providers.openai },
      deepseek: { ...DEFAULT_MODEL_API_SETTINGS.providers.deepseek },
      bailian: { ...DEFAULT_MODEL_API_SETTINGS.providers.bailian },
    },
  };
}

const tabs: Array<{ id: Tab; zh: string; en: string; icon: typeof MousePointer2 }> = [
  { id: "general", zh: "通用", en: "General", icon: Languages },
  { id: "input", zh: "控制", en: "Controls", icon: MousePointer2 },
  { id: "crosshair", zh: "准星", en: "Crosshair", icon: CrosshairIcon },
  { id: "display", zh: "显示", en: "Display", icon: MonitorCog },
  { id: "audio", zh: "音频", en: "Audio", icon: Volume2 },
];

const GRAPHICS_KEYS: Array<keyof TrainingSettings> = [
  "fpsLimit", "renderScale", "dprMode", "graphicsPreset", "lowSpec", "antialiasEnabled",
];

const crosshairPresetEnglish: Record<CrosshairPresetId, string> = {
  cross: "Cross",
  "cross-dot": "Cross + dot",
  dot: "Dot",
  circle: "Circle",
  "t-shape": "T-shape",
};

function SettingRow({ label, help, value, children }: { label: string; help?: string; value?: string; children: React.ReactNode }) {
  const hasValue = Boolean(value);
  return (
    <div className={`setting-row ${hasValue ? "has-value" : "no-value"}`}>
      <div className="setting-copy"><b>{label}</b>{help && <small>{help}</small>}</div>
      {hasValue && <output>{value}</output>}
      <div className="setting-control">{children}</div>
    </div>
  );
}

function NumberControl({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  const precision = step.toString().split(".")[1]?.length ?? 0;
  const adjust = (direction: -1 | 1) => {
    const next = Number((value + direction * step).toFixed(precision));
    onChange(Math.min(max, Math.max(min, next)));
  };
  return (
    <span className="number-control-shell">
      <input
        className="number-control"
        aria-label={label}
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
      />
      <span className="number-control-stepper">
        <button type="button" aria-label={`${tx("增加", "Increase ")}${label}`} disabled={value >= max} onClick={() => adjust(1)}><ChevronUp size={12} /></button>
        <button type="button" aria-label={`${tx("减少", "Decrease ")}${label}`} disabled={value <= min} onClick={() => adjust(-1)}><ChevronDown size={12} /></button>
      </span>
    </span>
  );
}

function RangeControl({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  const percent = (value - min) / (max - min) * 100;
  return <input className="range-control" aria-label={label} type="range" value={value} min={min} max={max} step={step} style={{ "--range-progress": `${percent}%` } as React.CSSProperties} onChange={(event) => onChange(Number(event.target.value))} />;
}

function SelectControl({ label, value, onChange, children, volume, muted }: { label: string; value: string | number; onChange: (value: string) => void; children: React.ReactNode; volume: number; muted: boolean }) {
  return <span className="select-control"><select aria-label={label} value={String(value)} onChange={(event) => { interfaceAudio.play("select", volume, muted); onChange(event.target.value); }}>{children}</select><ChevronDown size={15} /></span>;
}

const gameTriggerLabels: Record<string, string> = {
  cs2: "Counter-Strike 2",
  "call-of-duty": "Call of Duty",
  "rainbow-six": "Rainbow Six",
  pubg: "PUBG",
};

function GameSelectControl({ label, value, onChange, volume, muted }: { label: string; value: string; onChange: (value: string) => void; volume: number; muted: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = gameProfilesForDisplay.find((profile) => profile.id === value) ?? gameProfilesForDisplay[0];
  const groupLabel = (index: number) => gameProfilesForDisplay[index].id === "neon" ? "N" : gameProfilesForDisplay[index].name.charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        interfaceAudio.play("close", volume, muted);
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [muted, open, volume]);

  const focusOption = (index: number) => {
    window.requestAnimationFrame(() => {
      rootRef.current?.querySelectorAll<HTMLButtonElement>("[data-game-option]")[index]?.focus();
    });
  };
  const openMenu = () => {
    const selectedIndex = Math.max(0, gameProfilesForDisplay.findIndex((profile) => profile.id === value));
    interfaceAudio.play("open", volume, muted);
    setOpen(true);
    focusOption(selectedIndex);
  };
  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "Escape") {
      event.preventDefault();
      interfaceAudio.play("close", volume, muted);
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>(".game-select-trigger")?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      focusOption((index + direction + gameProfilesForDisplay.length) % gameProfilesForDisplay.length);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusOption(event.key === "Home" ? 0 : gameProfilesForDisplay.length - 1);
    }
  };

  return (
    <div className={`game-select-control ${open ? "open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="game-select-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          if (open) {
            interfaceAudio.play("close", volume, muted);
            setOpen(false);
          } else {
            openMenu();
          }
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            openMenu();
          } else if (event.key === "Escape") {
            if (open) interfaceAudio.play("close", volume, muted);
            setOpen(false);
          }
        }}
      >
        <GameIcon gameId={selected.id} />
        <span><b>{gameTriggerLabels[selected.id] ?? selected.name}</b><small>{selected.id === "neon" ? tx("训练器", "Trainer") : tx("游戏灵敏度", "Game sensitivity")}</small></span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="game-select-menu" id={menuId} role="listbox" aria-label={`${label}${tx("列表", " list")}`}>
          {gameProfilesForDisplay.map((profile, index) => {
            const group = groupLabel(index);
            const previousGroup = index > 0 ? groupLabel(index - 1) : "";
            return (
              <Fragment key={profile.id}>
                {group !== previousGroup && <div className="game-select-group" aria-hidden="true">{group}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={profile.id === value}
                  data-game-option
                  className={profile.id === value ? "selected" : ""}
                  onClick={() => { interfaceAudio.play("select", volume, muted); onChange(profile.id); setOpen(false); }}
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                >
                  <GameIcon gameId={profile.id} />
                  <span><b>{profile.name}</b><small>{profile.id === "neon" ? tx("训练器", "Trainer") : profile.status === "verified" ? tx("已验证", "Verified") : tx("参考数据", "Reference")}</small></span>
                  {profile.id === value && <Check size={15} />}
                </button>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} className={`toggle-control ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}><span /><b>{checked ? tx("开启", "On") : tx("关闭", "Off")}</b></button>;
}

function CrosshairPresetPicker({ settings, onApply }: { settings: TrainingSettings; onApply: (value: CrosshairPresetId) => void }) {
  return (
    <div className="crosshair-preset-grid" role="group" aria-label={tx("准星快捷样式", "Crosshair presets")}>
      {CROSSHAIR_PRESETS.map((preset) => (
        <button type="button" aria-label={`${tx("应用", "Apply ")}${tx(preset.label, crosshairPresetEnglish[preset.id])}${tx("样式", " preset")}`} onClick={() => onApply(preset.id)} key={preset.id}>
          <span className="crosshair-preset-preview"><TrainingCrosshair settings={{ ...settings, ...preset.parameters, crosshairOpacity: 1 }} /></span>
          <b>{tx(preset.label, crosshairPresetEnglish[preset.id])}</b>
        </button>
      ))}
    </div>
  );
}

function CrosshairArmPicker({ settings, onChange }: { settings: TrainingSettings; onChange: (key: "crosshairTop" | "crosshairBottom" | "crosshairLeft" | "crosshairRight", value: boolean) => void }) {
  const arms = [
    { key: "crosshairTop", label: tx("上", "Top") },
    { key: "crosshairBottom", label: tx("下", "Bottom") },
    { key: "crosshairLeft", label: tx("左", "Left") },
    { key: "crosshairRight", label: tx("右", "Right") },
  ] as const;
  return <div className="crosshair-arm-picker" role="group" aria-label={tx("准星线条方向", "Crosshair arm directions")}>{arms.map(({ key, label }) => <button type="button" className={settings[key] ? "active" : ""} aria-pressed={settings[key]} onClick={() => onChange(key, !settings[key])} key={key}>{label}</button>)}</div>;
}

function SettingsPreview({ tab, settings }: { tab: Tab; settings: TrainingSettings }) {
  if (tab !== "display") return null;
  return (
    <aside className="settings-inspector settings-preview-panel" aria-label={tx("训练显示预览", "Training display preview")}>
      <div className="inspector-heading"><Eye size={18} /><div><h3>{tx("效果预览", "Live preview")}</h3></div></div>
      <div className="preview-reference-note">{tx("仅供参考 · 实际效果以全屏训练为准", "Reference only · Fullscreen training may differ")}</div>
      <div className="grid-shot-settings-preview training-settings-preview" style={{ "--preview-hud-scale": settings.hudScale, "--preview-hud-opacity": settings.hudOpacity } as React.CSSProperties}>
        <div className="preview-stage-label"><span>{tx("训练界面", "Training HUD")}</span><b>{tx("实时", "LIVE")}</b></div>
        <GridShotSettingsPreview settings={settings} />
        <div className="preview-hud"><span>{tx("得分", "Score")}<b>12,480</b><em>{tx("连击", "Combo")} ×18</em></span><strong>00:38<em>GRID SHOT</em></strong><span>{tx("准确率", "Accuracy")}<b>91.4%</b><em>138 TPM</em></span></div>
        <TrainingCrosshair settings={settings} />
        {settings.showFps && <small>158 FPS · 6.3ms</small>}
      </div>
    </aside>
  );
}

function SettingsSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="settings-section"><header><h3>{title}</h3>{description && <p>{description}</p>}</header><div className="settings-section-body">{children}</div></section>;
}

type SettingsWorkspaceProps = {
  settings: TrainingSettings;
  onApply: (value: Partial<TrainingSettings>) => void;
  onClose?: () => void;
  context?: "global" | "grid-shot";
};

export function SettingsWorkspace({ settings, onApply, onClose, context = "global" }: SettingsWorkspaceProps) {
  const isAdmin = useAuthStore((state) => state.user?.role === "ADMIN");
  const [draft, setDraft] = useState(settings);
  const [modelApiDraft, setModelApiDraft] = useState<ModelApiSettings>(() => readModelApiSettings());
  const [savedModelApi, setSavedModelApi] = useState<ModelApiSettings>(() => emptyModelApiSettings());
  const [serverAiSettings, setServerAiSettings] = useState<AiProviderSettingsView>();
  const [aiSettingsError, setAiSettingsError] = useState("");
  const [savingAiSettings, setSavingAiSettings] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [channelTest, setChannelTest] = useState<ChannelTestState>({ status: "idle", fingerprint: "" });
  const [tab, setTab] = useState<Tab>("general");
  const [confirm, setConfirm] = useState(0);
  const [source, setSource] = useState("cs2");
  const [target, setTarget] = useState("neon");
  const [sourceValue, setSourceValue] = useState(1);
  const [copied, setCopied] = useState(false);
  const rollbackRef = useRef(settings);

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    void getAiProviderSettings().then((current) => {
      if (!active) return;
      setServerAiSettings(current);
      setAiSettingsError("");
      if (!current.configured || !current.provider || !current.model) return;
      const next = emptyModelApiSettings();
      next.activeProvider = current.provider;
      next.providers[current.provider].model = current.model;
      setModelApiDraft(next);
      setSavedModelApi(next);
      clearModelApiSettings();
    }).catch((error) => {
      if (active) setAiSettingsError(error instanceof Error ? error.message : tx("无法读取 AI 服务配置", "Could not load AI service settings"));
    });
    return () => { active = false; };
  }, [isAdmin]);
  useEffect(() => {
    if (!confirm) return;
    const timer = window.setInterval(() => setConfirm((seconds) => {
      if (seconds > 1) return seconds - 1;
      onApply(rollbackRef.current);
      setDraft(rollbackRef.current);
      return 0;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [confirm, onApply]);

  const changedKeys = useMemo(() => (Object.keys(draft) as Array<keyof TrainingSettings>).filter((key) => draft[key] !== settings[key]), [draft, settings]);
  const modelApiChanged = isAdmin && JSON.stringify(modelApiDraft) !== JSON.stringify(savedModelApi);
  const changed = changedKeys.length > 0 || modelApiChanged;
  const graphicsChanged = changedKeys.some((key) => GRAPHICS_KEYS.includes(key));
  const effectiveDpr = Math.min((draft.dprMode === "auto" ? devicePixelRatio : draft.dprMode) * draft.renderScale, 2.5);
  const fullscreenWidth = typeof window === "undefined" ? 2560 : window.screen.width;
  const fullscreenHeight = typeof window === "undefined" ? 1440 : window.screen.height;
  const sourceProfile = profiles.find((profile) => profile.id === source)!;
  const targetProfile = profiles.find((profile) => profile.id === target)!;
  const sourceSensitivityForCanonical = source === "neon" ? sourceValue * draft.horizontalRatio : sourceValue;
  const sourceCanonical = canonicalFromProfile(sourceSensitivityForCanonical, draft.mouseDpi, sourceProfile);
  const converted = sensitivityFromProfile(sourceCanonical, targetProfile);
  const convertedForTarget = converted === null ? null : target === "neon" ? converted / draft.horizontalRatio : converted;
  const interfaceVolume = draft.volume * draft.interfaceVolume;
  const interfaceMuted = draft.muted || draft.interfaceMuted;
  const activeProviderConfig = activeModelProvider(modelApiDraft);
  const activeModelOptions = MODEL_OPTIONS[modelApiDraft.activeProvider];
  const activeModelChoice = activeModelOptions.some((option) => option.id === activeProviderConfig.model)
    ? activeProviderConfig.model
    : "custom";
  const configuredForActiveProvider = Boolean(
    serverAiSettings?.configured && serverAiSettings.provider === modelApiDraft.activeProvider,
  );
  const testingWithSavedKey = configuredForActiveProvider && !activeProviderConfig.apiKey.trim();
  const canTestChannel = Boolean(
    activeProviderConfig.model.trim() && (activeProviderConfig.apiKey.trim() || configuredForActiveProvider),
  );
  const channelCredentialFingerprint = activeProviderConfig.apiKey.trim()
    ? `draft:${activeProviderConfig.apiKey.trim()}`
    : `saved:${serverAiSettings?.updatedAt ?? "none"}`;
  const channelFingerprint = `${modelApiDraft.activeProvider}:${channelCredentialFingerprint}:${activeProviderConfig.model}`;
  const visibleChannelTest = channelTest.fingerprint === channelFingerprint ? channelTest : undefined;
  const patchModelProvider = (provider: ModelProviderId, patch: Partial<{ apiKey: string; model: string }>) => {
    setModelApiDraft((current) => ({
      ...current,
      providers: {
        ...current.providers,
        [provider]: { ...current.providers[provider], ...patch },
      },
    }));
  };
  const patch = <K extends keyof TrainingSettings>(key: K, value: TrainingSettings[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const patchGraphics = <K extends keyof TrainingSettings>(key: K, value: TrainingSettings[K]) => patch(key, value);
  const testChannel = async () => {
    if (!canTestChannel) return;
    const fingerprint = channelFingerprint;
    setChannelTest({ status: "testing", fingerprint });
    try {
      const result = await testModelProviderConnection(
        modelApiDraft.activeProvider,
        activeProviderConfig.model.trim(),
        activeProviderConfig.apiKey,
      );
      setChannelTest({
        status: result.success ? "success" : "failed",
        fingerprint,
        result,
        message: result.message ?? undefined,
      });
    } catch (error) {
      setChannelTest({
        status: "failed",
        fingerprint,
        message: error instanceof Error ? error.message : tx("通道测试失败", "Connection test failed"),
      });
    }
  };
  const apply = async () => {
    rollbackRef.current = settings;
    onApply(draft);
    if (modelApiChanged) {
      setSavingAiSettings(true);
      setAiSettingsError("");
      try {
        const savedConfig = await saveAiProviderSettings(
          modelApiDraft.activeProvider,
          activeProviderConfig.model.trim(),
          activeProviderConfig.apiKey,
        );
        const saved = emptyModelApiSettings();
        saved.activeProvider = modelApiDraft.activeProvider;
        saved.providers[modelApiDraft.activeProvider].model = activeProviderConfig.model.trim();
        setModelApiDraft(saved);
        setSavedModelApi(saved);
        setServerAiSettings(savedConfig);
        clearModelApiSettings();
      } catch (error) {
        setAiSettingsError(error instanceof Error ? error.message : tx("AI 服务配置保存失败", "Could not save AI service settings"));
      } finally {
        setSavingAiSettings(false);
      }
    }
    if (graphicsChanged) setConfirm(12);
  };
  const resetCategory = () => {
    const defaults = tab === "display"
      ? { ...CATEGORY_DEFAULTS.graphics, ...CATEGORY_DEFAULTS.hud }
      : CATEGORY_DEFAULTS[tab];
    setDraft((current) => ({ ...current, ...defaults }));
    if (tab === "general" && isAdmin) setModelApiDraft({
      activeProvider: DEFAULT_MODEL_API_SETTINGS.activeProvider,
      providers: {
        openai: { ...DEFAULT_MODEL_API_SETTINGS.providers.openai },
        deepseek: { ...DEFAULT_MODEL_API_SETTINGS.providers.deepseek },
        bailian: { ...DEFAULT_MODEL_API_SETTINGS.providers.bailian },
      },
    });
  };
  const copyConverted = async () => {
    if (convertedForTarget === null) return;
    await navigator.clipboard.writeText(convertedForTarget.toFixed(3));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const generalContent = (
    <>
      <SettingsSection title={tx("语言", "Language")}>
        <SettingRow label={tx("界面语言", "Interface language")}>
          <div className="language-choice" role="group" aria-label={tx("界面语言", "Interface language")}>
            <button type="button" className={draft.language === "zh-CN" ? "active" : ""} aria-pressed={draft.language === "zh-CN"} onClick={() => patch("language", "zh-CN")}>中文</button>
            <button type="button" className={draft.language === "en-US" ? "active" : ""} aria-pressed={draft.language === "en-US"} onClick={() => patch("language", "en-US")}>English</button>
          </div>
        </SettingRow>
      </SettingsSection>
      {isAdmin && <SettingsSection title={tx("AI 深度分析", "AI deep analysis")}>
        <SettingRow label={tx("模型服务", "Provider")}>
          <div className="language-choice model-provider-choice" role="group" aria-label={tx("模型服务", "Model provider")}>
            {MODEL_PROVIDERS.map((provider) => (
              <button
                type="button"
                key={provider.id}
                className={modelApiDraft.activeProvider === provider.id ? "active" : ""}
                aria-pressed={modelApiDraft.activeProvider === provider.id}
                onClick={() => setModelApiDraft((current) => ({ ...current, activeProvider: provider.id }))}
              >{provider.label}</button>
            ))}
          </div>
        </SettingRow>
        <SettingRow
          label="API Key"
        >
          <div className="api-key-field">
            <span className="api-key-control">
              <input
                key={modelApiDraft.activeProvider}
                aria-label={`${modelApiDraft.activeProvider} API Key`}
                name={`model-api-key-${modelApiDraft.activeProvider}`}
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                spellCheck={false}
                type={showApiKey ? "text" : "password"}
                placeholder={configuredForActiveProvider ? tx("输入新 Key 以替换", "Enter a new key to replace") : tx("输入 API Key", "Enter API key")}
                value={activeProviderConfig.apiKey}
                onChange={(event) => patchModelProvider(modelApiDraft.activeProvider, { apiKey: event.target.value })}
              />
              <button
                type="button"
                disabled={!activeProviderConfig.apiKey}
                aria-label={showApiKey ? tx("隐藏新 API Key", "Hide new API key") : tx("显示新 API Key", "Show new API key")}
                onClick={() => setShowApiKey((value) => !value)}
              >
                {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
            {configuredForActiveProvider && <div className="api-key-configured">
              <span><CircleCheck size={14} /><b>{tx("服务器已配置", "Configured on server")}</b><code>{serverAiSettings?.apiKeyHint}</code></span>
              <small>{tx("留空会保留当前密钥；只有输入新 Key 并保存时才会替换。", "Leave blank to keep it. It is replaced only when you enter and save a new key.")}</small>
            </div>}
          </div>
        </SettingRow>
        <SettingRow
          label={tx("分析模型", "Analysis model")}
        >
          <div className="model-picker-control">
            <SelectControl
              label={tx("常用模型", "Common model")}
              value={activeModelChoice}
              volume={interfaceVolume}
              muted={interfaceMuted}
              onChange={(value) => patchModelProvider(modelApiDraft.activeProvider, {
                model: value === "custom" ? "" : value,
              })}
            >
              {activeModelOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              <option value="custom">{tx("自定义模型…", "Custom model…")}</option>
            </SelectControl>
            {activeModelChoice === "custom" && <input
              className="model-name-control"
              aria-label={tx("自定义模型名", "Custom model name")}
              maxLength={80}
              autoFocus
              spellCheck={false}
              placeholder={tx("输入模型 ID", "Enter model ID")}
              value={activeProviderConfig.model}
              onChange={(event) => patchModelProvider(modelApiDraft.activeProvider, { model: event.target.value })}
            />}
          </div>
        </SettingRow>
        <SettingRow label={tx("通道测试", "Connection test")} value={visibleChannelTest?.status === "success" ? tx("可用", "Available") : visibleChannelTest?.status === "failed" ? tx("失败", "Failed") : undefined}>
          <div className="channel-test-control" data-state={visibleChannelTest?.status ?? "idle"}>
            <button
              type="button"
              disabled={!canTestChannel || visibleChannelTest?.status === "testing"}
              onClick={() => void testChannel()}
            >
              {visibleChannelTest?.status === "testing" ? <RotateCcw className="spin" size={15} /> : <PlugZap size={15} />}
              {visibleChannelTest?.status === "testing"
                ? tx("正在测试", "Testing")
                : testingWithSavedKey
                  ? tx("测试已保存通道", "Test saved connection")
                  : tx("测试当前输入", "Test current input")}
            </button>
            <small className="channel-test-source"><KeyRound size={12} />{testingWithSavedKey
              ? tx("安全使用服务器已保存的密钥，浏览器不会读取明文。", "Uses the saved server key securely; the browser never reads it.")
              : activeProviderConfig.apiKey.trim()
                ? tx("使用尚未保存的新 Key 测试。", "Tests with the new, unsaved key.")
                : tx("请先为这个模型服务填写 API Key。", "Enter an API key for this provider first.")}</small>
            {visibleChannelTest?.status === "success" && visibleChannelTest.result && (
              <span><CircleCheck size={15} />{tx(
                `${visibleChannelTest.result.resolvedModel ?? activeProviderConfig.model} · ${visibleChannelTest.result.durationMs}ms · ${visibleChannelTest.result.inputTokens + visibleChannelTest.result.outputTokens} Token`,
                `${visibleChannelTest.result.resolvedModel ?? activeProviderConfig.model} · ${visibleChannelTest.result.durationMs}ms · ${visibleChannelTest.result.inputTokens + visibleChannelTest.result.outputTokens} tokens`,
              )}</span>
            )}
            {visibleChannelTest?.status === "failed" && (
              <span><CircleAlert size={15} />{visibleChannelTest.message ?? tx("Key、模型或通道不可用", "The key, model, or provider is unavailable")}</span>
            )}
          </div>
        </SettingRow>
        {aiSettingsError && <div className="setting-fact ai-key-fact" data-state="error"><CircleAlert size={16} /><div><b>{tx("AI 服务配置未保存", "AI service settings were not saved")}</b><span>{aiSettingsError}</span></div></div>}
        <div className="setting-fact ai-key-fact"><KeyRound size={16} /><div><b>{tx("全站 AI 分析配置", "Site-wide AI analysis settings")}</b><span>{tx("密钥加密保存在后端，仅管理员可更新；所有登录用户共用该分析服务。单局只发送压缩指标，不发送完整点击事件。", "The encrypted key is stored on the server and only admins can update it. All signed-in users share the analysis service; raw click events are never sent.")}</span></div></div>
      </SettingsSection>}
    </>
  );

  const inputContent = (
    <>
      <SettingsSection title={tx("鼠标控制", "Mouse control")}>
        <SettingRow label={tx("基础灵敏度", "Base sensitivity")} value={draft.sensitivity.toFixed(3)}><NumberControl label={tx("基础灵敏度", "Base sensitivity")} value={draft.sensitivity} min={0.01} max={10} step={0.001} onChange={(value) => patch("sensitivity", roundSensitivity(value))} /></SettingRow>
        <SettingRow label={tx("鼠标 DPI", "Mouse DPI")} value={`${draft.mouseDpi} DPI`}><NumberControl label={tx("鼠标 DPI", "Mouse DPI")} value={draft.mouseDpi} min={50} max={32000} step={50} onChange={(value) => patch("mouseDpi", value)} /></SettingRow>
        <SettingRow label={tx("X 轴倍率", "X-axis multiplier")} value={`${draft.horizontalRatio.toFixed(2)}×`}><RangeControl label={tx("X 轴倍率", "X-axis multiplier")} value={draft.horizontalRatio} min={0.1} max={2} step={0.05} onChange={(value) => patch("horizontalRatio", value)} /></SettingRow>
        <SettingRow label={tx("Y 轴倍率", "Y-axis multiplier")} value={`${draft.verticalRatio.toFixed(2)}×`}><RangeControl label={tx("Y 轴倍率", "Y-axis multiplier")} value={draft.verticalRatio} min={0.1} max={2} step={0.05} onChange={(value) => patch("verticalRatio", value)} /></SettingRow>
        <SettingRow label={tx("反转 X 轴", "Invert X axis")}><Toggle label={tx("反转 X 轴", "Invert X axis")} checked={draft.invertX} onChange={(value) => patch("invertX", value)} /></SettingRow>
        <SettingRow label={tx("反转 Y 轴", "Invert Y axis")}><Toggle label={tx("反转 Y 轴", "Invert Y axis")} checked={draft.invertY} onChange={(value) => patch("invertY", value)} /></SettingRow>
      </SettingsSection>

      <SettingsSection title={tx("灵敏度转换", "Sensitivity converter")}>
        <div className="converter-grid">
          <div className="converter-side">
            <small>{tx("来源", "Source")}</small>
            <GameSelectControl label={tx("来源游戏", "Source game")} value={source} volume={interfaceVolume} muted={interfaceMuted} onChange={(value) => { const profile = profiles.find((item) => item.id === value)!; setSource(value); setSourceValue((current) => Math.min(profile.sensitivityMax, Math.max(profile.sensitivityMin, current))); }} />
            <NumberControl label={tx("来源灵敏度", "Source sensitivity")} value={sourceValue} min={sourceProfile.sensitivityMin} max={sourceProfile.sensitivityMax} step={sourceProfile.sensitivityStep} onChange={(value) => setSourceValue(roundSensitivity(Math.min(sourceProfile.sensitivityMax, Math.max(sourceProfile.sensitivityMin, value))))} />
            <span>{sourceCanonical ? `${sourceCanonical.cmPer360.toFixed(2)} cm / 360` : tx("需要手动校准", "Manual calibration required")}</span>
          </div>
          <button type="button" className="converter-swap" aria-label={tx("交换来源与目标", "Swap source and target")} onClick={() => { if (convertedForTarget !== null) setSourceValue(roundSensitivity(convertedForTarget)); setSource(target); setTarget(source); }}><Shuffle size={18} /></button>
          <div className="converter-side result">
            <small>{tx("目标", "Target")}</small>
            <GameSelectControl label={tx("目标游戏", "Target game")} value={target} volume={interfaceVolume} muted={interfaceMuted} onChange={setTarget} />
            <strong>{convertedForTarget?.toFixed(3) ?? "—"}</strong>
            <span>{target === "neon" && draft.horizontalRatio !== 1 ? `${tx("已计入 X 轴倍率", "X-axis multiplier included")} ${draft.horizontalRatio.toFixed(2)}×` : sourceProfile.status === "beta" || targetProfile.status === "beta" ? tx("参考换算 · 建议进游戏复核", "Reference conversion · verify in game") : targetProfile.status === "verified" ? tx("已验证换算", "Verified conversion") : tx("需要手动校准", "Manual calibration required")}</span>
          </div>
        </div>
        <div className="converter-actions">
          <button type="button" onClick={() => void copyConverted()} disabled={convertedForTarget === null}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? tx("已复制", "Copied") : tx("复制结果", "Copy result")}</button>
          {target === "neon" && convertedForTarget !== null && <button type="button" className="primary" onClick={() => patch("sensitivity", roundSensitivity(convertedForTarget))}><Check size={16} />{tx("应用到 NEON AIM", "Apply to NEON AIM")}</button>}
        </div>
      </SettingsSection>
    </>
  );

  const crosshairContent = (
    <SettingsSection title={tx("准星", "Crosshair")}>
      <div className="crosshair-editor-hero">
        <div className="crosshair-workbench"><div className="crosshair-preview-center"><TrainingCrosshair settings={draft} /></div></div>
        <div className="crosshair-presets"><small>{tx("快捷样式", "Presets")}</small><CrosshairPresetPicker settings={draft} onApply={(value) => setDraft((current) => applyCrosshairPreset(current, value))} /></div>
      </div>
      <div className="settings-subsection-label"><span>{tx("细节调整", "Fine tuning")}</span></div>
        <SettingRow label={tx("主颜色", "Primary color")} value={draft.crosshairColor.toUpperCase()}><label className="color-control"><input aria-label={tx("准星主颜色", "Crosshair primary color")} type="color" value={draft.crosshairColor} onChange={(event) => patch("crosshairColor", event.target.value)} /><span style={{ background: draft.crosshairColor }} /></label></SettingRow>
        <SettingRow label={tx("线条方向", "Arm directions")} value={`${[draft.crosshairTop, draft.crosshairBottom, draft.crosshairLeft, draft.crosshairRight].filter(Boolean).length}/4`}><CrosshairArmPicker settings={draft} onChange={(key, value) => patch(key, value)} /></SettingRow>
        <SettingRow label={tx("线条粗细", "Thickness")} value={`${draft.crosshairThickness}px`}><RangeControl label={tx("准星线条粗细", "Crosshair thickness")} value={draft.crosshairThickness} min={1} max={5} step={1} onChange={(value) => patch("crosshairThickness", value)} /></SettingRow>
        <SettingRow label={tx("线条长度", "Length")} value={`${draft.crosshairLength}px`}><RangeControl label={tx("准星线条长度", "Crosshair length")} value={draft.crosshairLength} min={2} max={20} step={1} onChange={(value) => patch("crosshairLength", value)} /></SettingRow>
        <SettingRow label={tx("中心间距", "Center gap")} value={`${draft.crosshairGap}px`}><RangeControl label={tx("准星中心间距", "Crosshair center gap")} value={draft.crosshairGap} min={0} max={14} step={1} onChange={(value) => patch("crosshairGap", value)} /></SettingRow>
        <SettingRow label={tx("中心圆点", "Center dot")}><Toggle label={tx("中心圆点", "Center dot")} checked={draft.crosshairCenterDot} onChange={(value) => patch("crosshairCenterDot", value)} /></SettingRow>
        {draft.crosshairCenterDot && <SettingRow label={tx("圆点大小", "Dot size")} value={`${draft.crosshairDotSize}px`}><RangeControl label={tx("准星圆点大小", "Crosshair dot size")} value={draft.crosshairDotSize} min={1} max={8} step={1} onChange={(value) => patch("crosshairDotSize", value)} /></SettingRow>}
        <SettingRow label={tx("外环", "Outer ring")}><Toggle label={tx("准星外环", "Crosshair outer ring")} checked={draft.crosshairRing} onChange={(value) => patch("crosshairRing", value)} /></SettingRow>
        {draft.crosshairRing && <SettingRow label={tx("外环直径", "Ring diameter")} value={`${draft.crosshairRingDiameter}px`}><RangeControl label={tx("准星外环直径", "Crosshair ring diameter")} value={draft.crosshairRingDiameter} min={8} max={40} step={1} onChange={(value) => patch("crosshairRingDiameter", value)} /></SettingRow>}
        <SettingRow label={tx("透明度", "Opacity")} value={`${Math.round(draft.crosshairOpacity * 100)}%`}><RangeControl label={tx("准星透明度", "Crosshair opacity")} value={draft.crosshairOpacity} min={0.2} max={1} step={0.05} onChange={(value) => patch("crosshairOpacity", value)} /></SettingRow>
    </SettingsSection>
  );

  const displayContent = (
      <SettingsSection title={tx("显示", "Display")}>
        <SettingRow label={tx("FPS 上限", "FPS limit")} help={tx("限制帧率可降低显卡占用", "A frame cap can reduce GPU load")}><SelectControl label={tx("FPS 上限", "FPS limit")} value={draft.fpsLimit} volume={interfaceVolume} muted={interfaceMuted} onChange={(value) => patchGraphics("fpsLimit", (value === "auto" ? "auto" : Number(value)) as FpsLimit)}>{FPS_OPTIONS.filter((option) => option !== "unlimited").map((option) => <option value={option} key={option}>{option === "auto" ? tx("跟随显示器", "Match display") : `${option} FPS`}</option>)}</SelectControl></SettingRow>
        <SettingRow label={tx("渲染比例", "Render scale")} help={tx("降低可提升流畅度，提高可让目标和场景边缘更清晰", "Lower for performance, raise for sharper targets and edges")} value={`${Math.round(draft.renderScale * 100)}%`}><SelectControl label={tx("渲染比例", "Render scale")} value={draft.renderScale} volume={interfaceVolume} muted={interfaceMuted} onChange={(value) => patchGraphics("renderScale", Number(value))}>{[0.5, 0.67, 0.75, 0.85, 1, 1.1, 1.25].map((value) => <option value={value} key={value}>{Math.round(value * 100)}%</option>)}</SelectControl></SettingRow>
        <SettingRow label={tx("高分屏清晰度", "High-DPI clarity")} help={tx("高分辨率屏幕可适当提高；选择自动即可适配大多数设备", "Auto fits most displays; increase on high-resolution screens")} value={`${effectiveDpr.toFixed(2)}×`}><SelectControl label={tx("高分屏清晰度", "High-DPI clarity")} value={draft.dprMode} volume={interfaceVolume} muted={interfaceMuted} onChange={(value) => patchGraphics("dprMode", value === "auto" ? "auto" : Number(value) as 1)}>{["auto", 1, 1.25, 1.5, 1.75, 2].map((value) => <option value={value} key={value}>{value === "auto" ? tx("自动", "Auto") : `${value}×`}</option>)}</SelectControl></SettingRow>
        <SettingRow label={tx("抗锯齿", "Anti-aliasing")} help={tx("进入下一局时生效", "Applies next session")}><Toggle label={tx("抗锯齿", "Anti-aliasing")} checked={draft.antialiasEnabled} onChange={(value) => patchGraphics("antialiasEnabled", value)} /></SettingRow>
        <div className="render-readout"><span>{tx("预计全屏分辨率", "Estimated fullscreen resolution")}</span><strong>{Math.round(fullscreenWidth * effectiveDpr)} × {Math.round(fullscreenHeight * effectiveDpr)}</strong></div>
        <div className="settings-subsection-label"><span>{tx("训练界面", "Training HUD")}</span></div>
      <SettingRow label={tx("HUD 缩放", "HUD scale")} value={`${Math.round(draft.hudScale * 100)}%`}><RangeControl label={tx("HUD 缩放", "HUD scale")} value={draft.hudScale} min={0.7} max={1.4} step={0.05} onChange={(value) => patch("hudScale", value)} /></SettingRow>
      <SettingRow label={tx("HUD 透明度", "HUD opacity")} value={`${Math.round(draft.hudOpacity * 100)}%`}><RangeControl label={tx("HUD 透明度", "HUD opacity")} value={draft.hudOpacity} min={0.2} max={1} step={0.05} onChange={(value) => patch("hudOpacity", value)} /></SettingRow>
      <SettingRow label={tx("性能信息", "Performance data")}><Toggle label={tx("显示性能信息", "Show performance data")} checked={draft.showFps} onChange={(value) => patch("showFps", value)} /></SettingRow>
    </SettingsSection>
  );

  const audioContent = (
    <>
      <SettingsSection title={tx("声音总控", "Master output")}>
        <SettingRow label={tx("总音量", "Master volume")} value={`${Math.round(draft.volume * 100)}%`}><RangeControl label={tx("总音量", "Master volume")} value={draft.volume} min={0} max={1} step={0.05} onChange={(value) => patch("volume", value)} /></SettingRow>
        <SettingRow label={tx("全部静音", "Mute all")}><Toggle label={tx("全部静音", "Mute all")} checked={draft.muted} onChange={(value) => patch("muted", value)} /></SettingRow>
      </SettingsSection>
      <SettingsSection title={tx("界面反馈", "Interface feedback")}>
        <SettingRow label={tx("界面音量", "Interface volume")} value={`${Math.round(draft.interfaceVolume * 100)}%`}><RangeControl label={tx("界面音量", "Interface volume")} value={draft.interfaceVolume} min={0} max={1} step={0.05} onChange={(value) => patch("interfaceVolume", value)} /></SettingRow>
        <SettingRow label={tx("关闭界面音效", "Mute interface sounds")}><Toggle label={tx("关闭界面音效", "Mute interface sounds")} checked={draft.interfaceMuted} onChange={(value) => patch("interfaceMuted", value)} /></SettingRow>
      </SettingsSection>
    </>
  );

  const content = tab === "general" ? generalContent : tab === "input" ? inputContent : tab === "crosshair" ? crosshairContent : tab === "display" ? displayContent : audioContent;
  const hasPreview = tab === "display";

  return (
    <main className="settings-workspace">
      {context === "grid-shot" && <header className="settings-titlebar">
        <div><h1>{tx("系统设置", "System settings")}</h1></div>
        {onClose && <button type="button" className="settings-return" onClick={onClose}><ArrowLeft size={17} />{tx("返回暂停界面", "Back to pause menu")}</button>}
      </header>}
      <div className={`settings-shell ${hasPreview ? "has-preview" : "no-preview"}`}>
        <nav className="settings-tabs" aria-label={tx("设置分类", "Settings categories")}>{tabs.map((item) => { const Icon = item.icon; return <button type="button" className={tab === item.id ? "active" : ""} onClick={() => { interfaceAudio.play("select", interfaceVolume, interfaceMuted); setTab(item.id); }} key={item.id}><Icon size={18} /><b>{tx(item.zh, item.en)}</b></button>; })}</nav>
        <section className={`settings-content tab-${tab}`}>{content}</section>
        {hasPreview && <SettingsPreview tab={tab} settings={draft} />}
      </div>
      <div className="settings-actions"><div><span className={changed ? "dirty" : ""} />{changed ? `${tx("已修改", "Changed")} ${changedKeys.length + (modelApiChanged ? 1 : 0)} ${tx("项", "items")}` : tx("所有更改均已保存", "All changes saved")}</div><button type="button" onClick={() => { setDraft(settings); setModelApiDraft(savedModelApi); }} disabled={!changed || savingAiSettings}><Undo2 size={16} />{tx("撤销修改", "Undo changes")}</button><button type="button" onClick={resetCategory} disabled={savingAiSettings}><RotateCcw size={16} />{tx("恢复本类默认", "Reset category")}</button><button type="button" className="primary" disabled={!changed || savingAiSettings} onClick={() => void apply()}><Check size={17} />{savingAiSettings ? tx("正在保存", "Saving") : tx("保存设置", "Save settings")}</button></div>
      {confirm > 0 && <div className="graphics-confirm"><h3>{tx("保留新的画面设置？", "Keep these display settings?")}</h3><strong>{confirm}</strong><p>{tx("倒计时结束将自动恢复。", "Settings will revert when the timer ends.")}</p><div><button type="button" className="primary" onClick={() => setConfirm(0)}>{tx("保留设置", "Keep settings")}</button><button type="button" onClick={() => { onApply(rollbackRef.current); setDraft(rollbackRef.current); setConfirm(0); }}>{tx("恢复旧设置", "Revert")}</button></div></div>}
    </main>
  );
}
