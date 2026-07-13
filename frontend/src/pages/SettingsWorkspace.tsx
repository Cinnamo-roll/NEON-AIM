import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Crosshair as CrosshairIcon,
  Eye,
  MonitorCog,
  MousePointer2,
  RotateCcw,
  Shuffle,
  Undo2,
  Volume2,
} from "lucide-react";
import { TrainingCrosshair } from "../components/training/Crosshair";
import { GridShotSettingsPreview } from "../components/training/GridShotSettingsPreview";
import { GameIcon } from "../components/GameIcon";
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

type Tab = "input" | "crosshair" | "display" | "audio";

const tabs: Array<{ id: Tab; label: string; icon: typeof MousePointer2 }> = [
  { id: "input", label: "控制", icon: MousePointer2 },
  { id: "crosshair", label: "准星", icon: CrosshairIcon },
  { id: "display", label: "显示", icon: MonitorCog },
  { id: "audio", label: "音频", icon: Volume2 },
];

const GRAPHICS_KEYS: Array<keyof TrainingSettings> = [
  "fpsLimit", "renderScale", "dprMode", "graphicsPreset", "lowSpec", "antialiasEnabled",
];

function SettingRow({ label, help, value, children }: { label: string; help: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-copy"><b>{label}</b><small>{help}</small></div>
      <output className={value ? "" : "empty"}>{value ?? ""}</output>
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
        <button type="button" aria-label={`增加${label}`} disabled={value >= max} onClick={() => adjust(1)}><ChevronUp size={12} /></button>
        <button type="button" aria-label={`减少${label}`} disabled={value <= min} onClick={() => adjust(-1)}><ChevronDown size={12} /></button>
      </span>
    </span>
  );
}

function RangeControl({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  const percent = (value - min) / (max - min) * 100;
  return <input className="range-control" aria-label={label} type="range" value={value} min={min} max={max} step={step} style={{ "--range-progress": `${percent}%` } as React.CSSProperties} onChange={(event) => onChange(Number(event.target.value))} />;
}

function SelectControl({ label, value, onChange, children }: { label: string; value: string | number; onChange: (value: string) => void; children: React.ReactNode }) {
  return <span className="select-control"><select aria-label={label} value={String(value)} onChange={(event) => onChange(event.target.value)}>{children}</select><ChevronDown size={15} /></span>;
}

const gameTriggerLabels: Record<string, string> = {
  cs2: "Counter-Strike 2",
  "call-of-duty": "Call of Duty",
  "rainbow-six": "Rainbow Six",
  pubg: "PUBG",
};

function GameSelectControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = gameProfilesForDisplay.find((profile) => profile.id === value) ?? gameProfilesForDisplay[0];
  const groupLabel = (index: number) => gameProfilesForDisplay[index].id === "neon" ? "TRAINER" : gameProfilesForDisplay[index].name.charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const focusOption = (index: number) => {
    window.requestAnimationFrame(() => {
      rootRef.current?.querySelectorAll<HTMLButtonElement>("[data-game-option]")[index]?.focus();
    });
  };
  const openMenu = () => {
    const selectedIndex = Math.max(0, gameProfilesForDisplay.findIndex((profile) => profile.id === value));
    setOpen(true);
    focusOption(selectedIndex);
  };
  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "Escape") {
      event.preventDefault();
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
        onClick={() => open ? setOpen(false) : openMenu()}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            openMenu();
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        <GameIcon gameId={selected.id} />
        <span><b>{gameTriggerLabels[selected.id] ?? selected.name}</b><small>{selected.id === "neon" ? "训练器" : "游戏灵敏度"}</small></span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="game-select-menu" id={menuId} role="listbox" aria-label={`${label}列表`}>
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
                  onClick={() => { onChange(profile.id); setOpen(false); }}
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                >
                  <GameIcon gameId={profile.id} />
                  <span><b>{profile.name}</b><small>{profile.id === "neon" ? "训练器" : profile.status === "verified" ? "已验证" : "参考数据"}</small></span>
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
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} className={`toggle-control ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}><span /><b>{checked ? "开启" : "关闭"}</b></button>;
}

function CrosshairPresetPicker({ settings, onApply }: { settings: TrainingSettings; onApply: (value: CrosshairPresetId) => void }) {
  return (
    <div className="crosshair-preset-grid" role="group" aria-label="准星快捷样式">
      {CROSSHAIR_PRESETS.map((preset) => (
        <button type="button" aria-label={`应用${preset.label}样式`} onClick={() => onApply(preset.id)} key={preset.id}>
          <span className="crosshair-preset-preview"><TrainingCrosshair settings={{ ...settings, ...preset.parameters, crosshairOpacity: 1 }} /></span>
          <b>{preset.label}</b>
        </button>
      ))}
    </div>
  );
}

function CrosshairArmPicker({ settings, onChange }: { settings: TrainingSettings; onChange: (key: "crosshairTop" | "crosshairBottom" | "crosshairLeft" | "crosshairRight", value: boolean) => void }) {
  const arms = [
    { key: "crosshairTop", label: "上" },
    { key: "crosshairBottom", label: "下" },
    { key: "crosshairLeft", label: "左" },
    { key: "crosshairRight", label: "右" },
  ] as const;
  return <div className="crosshair-arm-picker" role="group" aria-label="准星线条方向">{arms.map(({ key, label }) => <button type="button" className={settings[key] ? "active" : ""} aria-pressed={settings[key]} onClick={() => onChange(key, !settings[key])} key={key}>{label}</button>)}</div>;
}

function SettingsPreview({ tab, settings }: { tab: Tab; settings: TrainingSettings }) {
  if (tab !== "display") return null;
  return (
    <aside className="settings-inspector settings-preview-panel" aria-label="训练显示预览">
      <div className="inspector-heading"><Eye size={18} /><div><small>LIVE PREVIEW</small><h3>效果预览</h3></div></div>
      <div className="preview-reference-note">仅供参考 · 实际效果以全屏训练为准</div>
      <div className="grid-shot-settings-preview training-settings-preview" style={{ "--preview-hud-scale": settings.hudScale, "--preview-hud-opacity": settings.hudOpacity } as React.CSSProperties}>
        <div className="preview-stage-label"><span>TRAINING HUD</span><b>LIVE</b></div>
        <GridShotSettingsPreview settings={settings} />
        <div className="preview-hud"><span>SCORE<b>12,480</b><em>COMBO ×18</em></span><strong>00:38<em>GRID SHOT</em></strong><span>ACCURACY<b>91.4%</b><em>138 TPM</em></span></div>
        <TrainingCrosshair settings={settings} />
        {settings.showFps && <small>158 FPS · 6.3ms</small>}
      </div>
    </aside>
  );
}

function SettingsSection({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="settings-section"><header><span>{eyebrow}</span><h3>{title}</h3><p>{description}</p></header><div className="settings-section-body">{children}</div></section>;
}

type SettingsWorkspaceProps = {
  settings: TrainingSettings;
  onApply: (value: Partial<TrainingSettings>) => void;
  onClose?: () => void;
  context?: "global" | "grid-shot";
};

export function SettingsWorkspace({ settings, onApply, onClose, context = "global" }: SettingsWorkspaceProps) {
  const [draft, setDraft] = useState(settings);
  const [tab, setTab] = useState<Tab>("input");
  const [confirm, setConfirm] = useState(0);
  const [source, setSource] = useState("cs2");
  const [target, setTarget] = useState("neon");
  const [sourceValue, setSourceValue] = useState(1);
  const [copied, setCopied] = useState(false);
  const rollbackRef = useRef(settings);

  useEffect(() => setDraft(settings), [settings]);
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
  const changed = changedKeys.length > 0;
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
  const patch = <K extends keyof TrainingSettings>(key: K, value: TrainingSettings[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const patchGraphics = <K extends keyof TrainingSettings>(key: K, value: TrainingSettings[K]) => patch(key, value);
  const apply = () => {
    rollbackRef.current = settings;
    onApply(draft);
    if (graphicsChanged) setConfirm(12);
  };
  const resetCategory = () => {
    const defaults = tab === "display"
      ? { ...CATEGORY_DEFAULTS.graphics, ...CATEGORY_DEFAULTS.hud }
      : CATEGORY_DEFAULTS[tab];
    setDraft((current) => ({ ...current, ...defaults }));
  };
  const copyConverted = async () => {
    if (convertedForTarget === null) return;
    await navigator.clipboard.writeText(convertedForTarget.toFixed(3));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const inputContent = (
    <>
      <SettingsSection eyebrow="MOUSE CONTROL" title="鼠标控制" description="调整鼠标移动与视角转动的手感。大多数玩家只需要设置基础灵敏度和 DPI。">
        <SettingRow label="基础灵敏度" help="数值越高，移动相同距离时视角转动得越快" value={draft.sensitivity.toFixed(3)}><NumberControl label="基础灵敏度" value={draft.sensitivity} min={0.01} max={10} step={0.001} onChange={(value) => patch("sensitivity", roundSensitivity(value))} /></SettingRow>
        <SettingRow label="鼠标 DPI" help="填写鼠标软件中正在使用的 DPI，用于计算 cm/360" value={`${draft.mouseDpi} DPI`}><NumberControl label="鼠标 DPI" value={draft.mouseDpi} min={50} max={32000} step={50} onChange={(value) => patch("mouseDpi", value)} /></SettingRow>
        <SettingRow label="X 轴倍率" help="调整左右移动速度；1.00× 表示使用基础灵敏度" value={`${draft.horizontalRatio.toFixed(2)}×`}><RangeControl label="X 轴倍率" value={draft.horizontalRatio} min={0.1} max={2} step={0.05} onChange={(value) => patch("horizontalRatio", value)} /></SettingRow>
        <SettingRow label="Y 轴倍率" help="调整上下移动速度；1.00× 表示使用基础灵敏度" value={`${draft.verticalRatio.toFixed(2)}×`}><RangeControl label="Y 轴倍率" value={draft.verticalRatio} min={0.1} max={2} step={0.05} onChange={(value) => patch("verticalRatio", value)} /></SettingRow>
        <SettingRow label="反转 X 轴" help="反转鼠标左右移动方向"><Toggle label="反转 X 轴" checked={draft.invertX} onChange={(value) => patch("invertX", value)} /></SettingRow>
        <SettingRow label="反转 Y 轴" help="反转鼠标上下移动方向"><Toggle label="反转 Y 轴" checked={draft.invertY} onChange={(value) => patch("invertY", value)} /></SettingRow>
        <div className="setting-fact"><MousePointer2 size={17} /><div><b>轴向倍率如何计算？</b><span>左右速度 = 基础灵敏度 × X 轴倍率，上下速度 = 基础灵敏度 × Y 轴倍率。两个倍率都保持 1.00× 时，手感与原来的基础灵敏度完全一致。</span></div></div>
      </SettingsSection>

      <SettingsSection eyebrow="CM / 360" title="灵敏度转换" description="选择来源游戏并填写当前灵敏度，即可换算出在其他游戏中相同的转身距离。">
        <div className="converter-grid">
          <div className="converter-side">
            <small>来源</small>
            <GameSelectControl label="来源游戏" value={source} onChange={(value) => { const profile = profiles.find((item) => item.id === value)!; setSource(value); setSourceValue((current) => Math.min(profile.sensitivityMax, Math.max(profile.sensitivityMin, current))); }} />
            <NumberControl label="来源灵敏度" value={sourceValue} min={sourceProfile.sensitivityMin} max={sourceProfile.sensitivityMax} step={sourceProfile.sensitivityStep} onChange={(value) => setSourceValue(roundSensitivity(Math.min(sourceProfile.sensitivityMax, Math.max(sourceProfile.sensitivityMin, value))))} />
            <span>{sourceCanonical ? `${sourceCanonical.cmPer360.toFixed(2)} cm / 360` : "需要手动校准"}</span>
          </div>
          <button type="button" className="converter-swap" aria-label="交换来源与目标" onClick={() => { if (convertedForTarget !== null) setSourceValue(roundSensitivity(convertedForTarget)); setSource(target); setTarget(source); }}><Shuffle size={18} /></button>
          <div className="converter-side result">
            <small>目标</small>
            <GameSelectControl label="目标游戏" value={target} onChange={setTarget} />
            <strong>{convertedForTarget?.toFixed(3) ?? "—"}</strong>
            <span>{target === "neon" && draft.horizontalRatio !== 1 ? `已计入 X 轴倍率 ${draft.horizontalRatio.toFixed(2)}×` : sourceProfile.status === "beta" || targetProfile.status === "beta" ? "参考换算 · 建议进游戏复核" : targetProfile.status === "verified" ? "已验证换算" : "需要手动校准"}</span>
          </div>
        </div>
        <div className="converter-actions">
          <button type="button" onClick={() => void copyConverted()} disabled={convertedForTarget === null}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "已复制" : "复制结果"}</button>
          {target === "neon" && convertedForTarget !== null && <button type="button" className="primary" onClick={() => patch("sensitivity", roundSensitivity(convertedForTarget))}><Check size={16} />应用到 NEON AIM</button>}
        </div>
      </SettingsSection>
        <div className="converter-disclaimer">换算以鼠标腰射灵敏度和相同 cm/360 为准，不包含 ADS、瞄具倍率、鼠标加速或游戏内独立轴向倍率。PUBG 使用独立的指数灵敏度曲线；PUBG、Delta Force 与 CrossFire 的结果均建议在游戏训练场完成一次 360° 距离复核。</div>
    </>
  );

  const crosshairContent = (
    <SettingsSection eyebrow="RETICLE" title="准星设置" description="先选一个接近你习惯的样式，再调整颜色、尺寸和结构。">
      <div className="crosshair-editor-hero">
        <div className="crosshair-workbench"><small>实时预览</small><div className="crosshair-preview-center"><TrainingCrosshair settings={draft} /></div><span>实际尺寸</span></div>
        <div className="crosshair-presets"><small>快捷样式</small><CrosshairPresetPicker settings={draft} onApply={(value) => setDraft((current) => applyCrosshairPreset(current, value))} /></div>
      </div>
      <div className="settings-subsection-label"><span>细节调整</span></div>
        <SettingRow label="主颜色" help="统一控制线条、中心点和外环颜色" value={draft.crosshairColor.toUpperCase()}><label className="color-control"><input aria-label="准星主颜色" type="color" value={draft.crosshairColor} onChange={(event) => patch("crosshairColor", event.target.value)} /><span style={{ background: draft.crosshairColor }} /></label></SettingRow>
        <SettingRow label="线条方向" help="分别控制上、下、左、右四条线，可组合出 T 型或不对称准星" value={`${[draft.crosshairTop, draft.crosshairBottom, draft.crosshairLeft, draft.crosshairRight].filter(Boolean).length}/4`}><CrosshairArmPicker settings={draft} onChange={(key, value) => patch(key, value)} /></SettingRow>
        <SettingRow label="线条粗细" help="四向线条和外环共用的像素宽度" value={`${draft.crosshairThickness}px`}><RangeControl label="准星线条粗细" value={draft.crosshairThickness} min={1} max={5} step={1} onChange={(value) => patch("crosshairThickness", value)} /></SettingRow>
        <SettingRow label="线条长度" help="控制每条已启用线段的长度" value={`${draft.crosshairLength}px`}><RangeControl label="准星线条长度" value={draft.crosshairLength} min={2} max={20} step={1} onChange={(value) => patch("crosshairLength", value)} /></SettingRow>
        <SettingRow label="中心间距" help="控制线段与瞄准中心之间的留白" value={`${draft.crosshairGap}px`}><RangeControl label="准星中心间距" value={draft.crosshairGap} min={0} max={14} step={1} onChange={(value) => patch("crosshairGap", value)} /></SettingRow>
        <SettingRow label="中心圆点" help="独立于线条和外环，可与任意结构叠加"><Toggle label="中心圆点" checked={draft.crosshairCenterDot} onChange={(value) => patch("crosshairCenterDot", value)} /></SettingRow>
        {draft.crosshairCenterDot && <SettingRow label="圆点大小" help="调整中心圆点的大小" value={`${draft.crosshairDotSize}px`}><RangeControl label="准星圆点大小" value={draft.crosshairDotSize} min={1} max={8} step={1} onChange={(value) => patch("crosshairDotSize", value)} /></SettingRow>}
        <SettingRow label="外环" help="独立的圆形轮廓，可与线条、中心点同时使用"><Toggle label="准星外环" checked={draft.crosshairRing} onChange={(value) => patch("crosshairRing", value)} /></SettingRow>
        {draft.crosshairRing && <SettingRow label="外环直径" help="调整外环的整体大小" value={`${draft.crosshairRingDiameter}px`}><RangeControl label="准星外环直径" value={draft.crosshairRingDiameter} min={8} max={40} step={1} onChange={(value) => patch("crosshairRingDiameter", value)} /></SettingRow>}
        <SettingRow label="准星透明度" help="调整准星整体的透明程度" value={`${Math.round(draft.crosshairOpacity * 100)}%`}><RangeControl label="准星透明度" value={draft.crosshairOpacity} min={0.2} max={1} step={0.05} onChange={(value) => patch("crosshairOpacity", value)} /></SettingRow>
    </SettingsSection>
  );

  const displayContent = (
      <SettingsSection eyebrow="DISPLAY" title="显示设置" description="调整画面清晰度、帧率和训练信息的显示方式。">
        <SettingRow label="FPS 上限" help="通常建议选择“跟随显示器”，也可以限制帧率以降低显卡占用"><SelectControl label="FPS 上限" value={draft.fpsLimit} onChange={(value) => patchGraphics("fpsLimit", (value === "auto" ? "auto" : Number(value)) as FpsLimit)}>{FPS_OPTIONS.filter((option) => option !== "unlimited").map((option) => <option value={option} key={option}>{option === "auto" ? "跟随显示器" : `${option} FPS`}</option>)}</SelectControl></SettingRow>
        <SettingRow label="渲染比例" help="降低可提升流畅度，提高可让目标和场景边缘更清晰" value={`${Math.round(draft.renderScale * 100)}%`}><SelectControl label="渲染比例" value={draft.renderScale} onChange={(value) => patchGraphics("renderScale", Number(value))}>{[0.5, 0.67, 0.75, 0.85, 1, 1.1, 1.25].map((value) => <option value={value} key={value}>{Math.round(value * 100)}%</option>)}</SelectControl></SettingRow>
        <SettingRow label="高分屏清晰度" help="高分辨率屏幕可适当提高；选择自动即可适配大多数设备" value={`${effectiveDpr.toFixed(2)}×`}><SelectControl label="高分屏清晰度" value={draft.dprMode} onChange={(value) => patchGraphics("dprMode", value === "auto" ? "auto" : Number(value) as 1)}>{["auto", 1, 1.25, 1.5, 1.75, 2].map((value) => <option value={value} key={value}>{value === "auto" ? "自动" : `${value}×`}</option>)}</SelectControl></SettingRow>
        <SettingRow label="抗锯齿" help="减少目标和场景边缘的锯齿；下次进入训练时应用"><Toggle label="抗锯齿" checked={draft.antialiasEnabled} onChange={(value) => patchGraphics("antialiasEnabled", value)} /></SettingRow>
        <div className="render-readout"><span>预计全屏渲染分辨率</span><strong>{Math.round(fullscreenWidth * effectiveDpr)} × {Math.round(fullscreenHeight * effectiveDpr)}</strong><small>按当前显示器全屏尺寸与清晰度估算</small></div>
        <div className="settings-subsection-label"><span>训练界面</span><small>按自己的阅读习惯调整</small></div>
      <SettingRow label="HUD 缩放" help="统一缩放成绩、计时和FPS信息" value={`${Math.round(draft.hudScale * 100)}%`}><RangeControl label="HUD 缩放" value={draft.hudScale} min={0.7} max={1.4} step={0.05} onChange={(value) => patch("hudScale", value)} /></SettingRow>
      <SettingRow label="HUD 透明度" help="不影响准星和目标" value={`${Math.round(draft.hudOpacity * 100)}%`}><RangeControl label="HUD 透明度" value={draft.hudOpacity} min={0.2} max={1} step={0.05} onChange={(value) => patch("hudOpacity", value)} /></SettingRow>
      <SettingRow label="性能信息" help="在右下角显示FPS与帧时间"><Toggle label="显示性能信息" checked={draft.showFps} onChange={(value) => patch("showFps", value)} /></SettingRow>
    </SettingsSection>
  );

  const audioContent = (
    <SettingsSection eyebrow="AUDIO" title="音频设置" description="调整训练中的整体音量，需要安静时可以一键静音。">
      <SettingRow label="总音量" help="调整所有训练音效的音量" value={`${Math.round(draft.volume * 100)}%`}><RangeControl label="总音量" value={draft.volume} min={0} max={1} step={0.05} onChange={(value) => patch("volume", value)} /></SettingRow>
      <SettingRow label="全部静音" help="关闭所有训练音效"><Toggle label="全部静音" checked={draft.muted} onChange={(value) => patch("muted", value)} /></SettingRow>
    </SettingsSection>
  );

  const content = tab === "input" ? inputContent : tab === "crosshair" ? crosshairContent : tab === "display" ? displayContent : audioContent;
  const hasPreview = tab === "display";

  return (
    <main className="settings-workspace">
      <header className="settings-titlebar">
        <div><small>{context === "grid-shot" ? "GRID SHOT · PAUSED" : "PLAYER SETTINGS"}</small><h1>{context === "grid-shot" ? "系统设置" : "设置"}</h1><p>{context === "grid-shot" ? "调整鼠标、显示、准星和声音。训练规则请在开始前通过“训练设置”修改。" : "调整控制、显示、准星和声音，让训练更符合你的习惯。"}</p></div>
        {onClose && <button type="button" className="settings-return" onClick={onClose}><ArrowLeft size={17} />返回暂停界面</button>}
      </header>
      <div className={`settings-shell ${hasPreview ? "has-preview" : "no-preview"}`}>
        <nav className="settings-tabs" aria-label="设置分类">{tabs.map((item) => { const Icon = item.icon; return <button type="button" className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)} key={item.id}><Icon size={18} /><b>{item.label}</b></button>; })}</nav>
        <section className="settings-content">{content}</section>
        {hasPreview && <SettingsPreview tab={tab} settings={draft} />}
      </div>
      <div className="settings-actions"><div><span className={changed ? "dirty" : ""} />{changed ? `已修改 ${changedKeys.length} 项` : "所有更改均已保存"}</div><button type="button" onClick={() => setDraft(settings)} disabled={!changed}><Undo2 size={16} />撤销修改</button><button type="button" onClick={resetCategory}><RotateCcw size={16} />恢复本类默认</button><button type="button" className="primary" disabled={!changed} onClick={apply}><Check size={17} />保存设置</button></div>
      {confirm > 0 && <div className="graphics-confirm"><small>DISPLAY SAFETY</small><h3>保留新的画面设置？</h3><strong>{confirm}</strong><p>倒计时结束将恢复应用前的画面配置。</p><div><button type="button" className="primary" onClick={() => setConfirm(0)}>保留设置</button><button type="button" onClick={() => { onApply(rollbackRef.current); setDraft(rollbackRef.current); setConfirm(0); }}>恢复旧设置</button></div></div>}
    </main>
  );
}
