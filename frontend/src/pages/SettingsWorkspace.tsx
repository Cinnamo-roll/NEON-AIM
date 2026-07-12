import { useEffect, useMemo, useRef, useState } from "react";
import {
  Accessibility,
  Check,
  ChevronDown,
  Copy,
  Crosshair as CrosshairIcon,
  Database,
  Eye,
  Gauge,
  MonitorCog,
  MousePointer2,
  RotateCcw,
  Shuffle,
  Undo2,
  Volume2,
} from "lucide-react";
import { TrainingCrosshair } from "../components/training/Crosshair";
import { FPS_OPTIONS, type FpsLimit } from "../game/performance/frameRate";
import {
  canonicalFromGame,
  createNeonInputSensitivity,
  profiles,
  roundSensitivity,
  sensitivityFromCanonical,
} from "../game/sensitivity/sensitivity";
import {
  applyGraphicsPreset,
  CATEGORY_DEFAULTS,
  patchCustomGraphics,
  type ConfigurableCategory,
} from "../game/settings/trainingSettings";
import type { TrainingSettings } from "../game/types/training";

type Tab = ConfigurableCategory | "accessibility" | "data";

const tabs: Array<{ id: Tab; label: string; note: string; icon: typeof MousePointer2 }> = [
  { id: "input", label: "控制", note: "鼠标与灵敏度", icon: MousePointer2 },
  { id: "crosshair", label: "准星", note: "轮廓与命中确认", icon: CrosshairIcon },
  { id: "graphics", label: "画面", note: "性能与可读性", icon: MonitorCog },
  { id: "hud", label: "训练", note: "HUD 与目标显示", icon: Gauge },
  { id: "audio", label: "音频", note: "独立反馈音量", icon: Volume2 },
  { id: "accessibility", label: "辅助功能", note: "后续版本", icon: Accessibility },
  { id: "data", label: "数据", note: "后续版本", icon: Database },
];

const GRAPHICS_KEYS: Array<keyof TrainingSettings> = [
  "fov", "fpsLimit", "renderScale", "dprMode", "graphicsPreset", "particleQuality", "fogEnabled", "dynamicGridEnabled", "lowSpec", "antialiasEnabled",
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
  return <input className="number-control" aria-label={label} type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />;
}

function RangeControl({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  const percent = (value - min) / (max - min) * 100;
  return <input className="range-control" aria-label={label} type="range" value={value} min={min} max={max} step={step} style={{ "--range-progress": `${percent}%` } as React.CSSProperties} onChange={(event) => onChange(Number(event.target.value))} />;
}

function SelectControl({ label, value, onChange, children }: { label: string; value: string | number; onChange: (value: string) => void; children: React.ReactNode }) {
  return <span className="select-control"><select aria-label={label} value={String(value)} onChange={(event) => onChange(event.target.value)}>{children}</select><ChevronDown size={15} /></span>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} className={`toggle-control ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}><span /><b>{checked ? "开启" : "关闭"}</b></button>;
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return <div className="segmented-control" role="group" aria-label={label}>{options.map((option) => <button type="button" className={value === option.value ? "active" : ""} aria-pressed={value === option.value} onClick={() => onChange(option.value)} key={option.value}>{option.label}</button>)}</div>;
}

const crosshairTypes = [
  { value: "cross", label: "十字" },
  { value: "cross-dot", label: "十字点" },
  { value: "dot", label: "圆点" },
  { value: "circle", label: "圆环" },
  { value: "t-shape", label: "T 型" },
] as const;

function CrosshairTypePicker({ settings, onChange }: { settings: TrainingSettings; onChange: (value: TrainingSettings["crosshair"]) => void }) {
  return (
    <div className="crosshair-type-grid" role="group" aria-label="准星类型">
      {crosshairTypes.map((type) => (
        <button type="button" className={settings.crosshair === type.value ? "active" : ""} aria-pressed={settings.crosshair === type.value} onClick={() => onChange(type.value)} key={type.value}>
          <span className="crosshair-type-preview"><TrainingCrosshair settings={{ ...settings, crosshair: type.value, crosshairOpacity: 1 }} /></span>
          <b>{type.label}</b>
          {settings.crosshair === type.value && <Check size={14} />}
        </button>
      ))}
    </div>
  );
}

function SettingsPreview({ tab, settings, effectiveDpr }: { tab: Tab; settings: TrainingSettings; effectiveDpr: number }) {
  const qualityLabel = settings.graphicsPreset === "low" ? "性能" : settings.graphicsPreset === "medium" ? "均衡" : settings.graphicsPreset === "high" ? "高画质" : settings.graphicsPreset === "ultra" ? "极致" : "自定义";
  return (
    <aside className="settings-inspector settings-preview-panel">
      <div className="inspector-heading"><Eye size={18} /><div><small>LIVE PREVIEW</small><h3>效果预览</h3></div></div>
      {tab === "graphics" ? <>
        <div className={`graphics-live-preview ${settings.fogEnabled ? "with-fog" : ""} ${settings.lowSpec ? "lean" : "full"}`} style={{ "--preview-fov": `${0.82 + (settings.fov - 60) / 300}` } as React.CSSProperties}>
          <div className="preview-ceiling" />
          <div className="preview-wall left" /><div className="preview-wall center" /><div className="preview-wall right" />
          {settings.dynamicGridEnabled && <div className="preview-grid" />}
          <i className="preview-target one" style={{ background: settings.targetColor }} /><i className="preview-target two" style={{ background: settings.targetColor }} /><i className="preview-target three" style={{ background: settings.targetColor }} />
          <TrainingCrosshair settings={settings} />
        </div>
        <div className="preview-facts"><span>FOV<b>{settings.fov.toFixed(0)}°</b></span><span>清晰倍率<b>{effectiveDpr.toFixed(2)}×</b></span><span>画质<b>{qualityLabel}</b></span></div>
        <p className="preview-help">预览会同步显示 FOV、环境雾、地面网格、灯光层次和目标颜色。</p>
      </> : tab === "hud" ? <>
        <div className="training-live-preview" style={{ "--preview-hud-scale": settings.hudScale, "--preview-hud-opacity": settings.hudOpacity, "--preview-target-scale": settings.targetSize } as React.CSSProperties}>
          <div className="preview-hud"><span>SCORE<b>12,480</b></span><strong>00:38</strong><span>ACCURACY<b>91.4%</b></span></div>
          <i className="training-preview-target" style={{ background: settings.targetColor }} />
          <TrainingCrosshair settings={settings} />
          {settings.showFps && <small>158 FPS · 6.3ms</small>}
        </div>
        <p className="preview-help">HUD 透明度、缩放、目标颜色和大小会在这里即时更新。</p>
      </> : tab === "crosshair" ? <div className="compact-settings-preview"><TrainingCrosshair settings={settings} /><b>{crosshairTypes.find((type) => type.value === settings.crosshair)?.label}</b><span>训练中的实际准星</span></div> : tab === "input" ? <div className="input-live-preview"><div className="axis x"><i style={{ width: `${Math.min(100, settings.horizontalRatio * 50)}%` }} /></div><div className="axis y"><i style={{ height: `${Math.min(100, settings.verticalRatio * 50)}%` }} /></div><strong>{createNeonInputSensitivity(settings).cmPer360.toFixed(2)} cm</strong><span>完成 360° 转身所需距离</span></div> : tab === "audio" ? <div className="audio-live-preview">{[["总音量", settings.volume], ["命中", settings.hitVolume], ["Miss", settings.missVolume], ["Combo", settings.comboVolume]].map(([label, value]) => <span key={String(label)}><small>{label}</small><i><b style={{ width: `${Number(value) * 100}%` }} /></i></span>)}</div> : <div className="preview-coming-soon"><b>功能仍在准备中</b><span>开放后会在这里提供对应预览。</span></div>}
    </aside>
  );
}

function SettingsSection({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="settings-section"><header><span>{eyebrow}</span><h3>{title}</h3><p>{description}</p></header><div className="settings-section-body">{children}</div></section>;
}

export function SettingsWorkspace({ settings, onApply }: { settings: TrainingSettings; onApply: (value: Partial<TrainingSettings>) => void }) {
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
  const canonical = createNeonInputSensitivity(draft);
  const effectiveDpr = Math.min((draft.dprMode === "auto" ? devicePixelRatio : draft.dprMode) * draft.renderScale, 2.5);
  const sourceProfile = profiles.find((profile) => profile.id === source)!;
  const targetProfile = profiles.find((profile) => profile.id === target)!;
  const sourceSensitivityForCanonical = source === "neon" ? sourceValue * draft.horizontalRatio : sourceValue;
  const sourceCanonical = sourceProfile.yawCoefficient ? canonicalFromGame(sourceSensitivityForCanonical, draft.mouseDpi, sourceProfile.yawCoefficient) : null;
  const converted = sourceCanonical && targetProfile.yawCoefficient ? sensitivityFromCanonical(sourceCanonical, targetProfile.yawCoefficient) : null;
  const convertedForTarget = converted === null ? null : target === "neon" ? converted / draft.horizontalRatio : converted;
  const isDotCrosshair = draft.crosshair === "dot";
  const isCircleCrosshair = draft.crosshair === "circle";
  const isLineCrosshair = !isDotCrosshair && !isCircleCrosshair;

  const patch = <K extends keyof TrainingSettings>(key: K, value: TrainingSettings[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const patchGraphics = <K extends keyof TrainingSettings>(key: K, value: TrainingSettings[K]) => setDraft((current) => patchCustomGraphics(current, key, value));
  const apply = () => {
    rollbackRef.current = settings;
    onApply(draft);
    if (graphicsChanged) setConfirm(12);
  };
  const resetCategory = () => {
    if (tab === "accessibility" || tab === "data") return;
    setDraft((current) => ({ ...current, ...CATEGORY_DEFAULTS[tab] }));
  };
  const copyConverted = async () => {
    if (convertedForTarget === null) return;
    await navigator.clipboard.writeText(convertedForTarget.toFixed(3));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const inputContent = (
    <>
      <div className="control-summary" aria-label="当前控制摘要">
        <span><small>基础灵敏度</small><strong>{draft.sensitivity.toFixed(3)}</strong></span>
        <span><small>物理距离</small><strong>{canonical.cmPer360.toFixed(2)} <em>cm / 360</em></strong></span>
        <span><small>轴向倍率</small><strong>{draft.horizontalRatio.toFixed(2)} <em>X</em> / {draft.verticalRatio.toFixed(2)} <em>Y</em></strong></span>
      </div>
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
            <SelectControl label="来源游戏" value={source} onChange={(value) => { const profile = profiles.find((item) => item.id === value)!; setSource(value); setSourceValue((current) => Math.min(profile.sensitivityMax, Math.max(profile.sensitivityMin, current))); }}>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</SelectControl>
            <NumberControl label="来源灵敏度" value={sourceValue} min={sourceProfile.sensitivityMin} max={sourceProfile.sensitivityMax} step={sourceProfile.sensitivityStep} onChange={(value) => setSourceValue(roundSensitivity(Math.min(sourceProfile.sensitivityMax, Math.max(sourceProfile.sensitivityMin, value))))} />
            <span>{sourceCanonical ? `${sourceCanonical.cmPer360.toFixed(2)} cm / 360` : "需要手动校准"}</span>
          </div>
          <button type="button" className="converter-swap" aria-label="交换来源与目标" onClick={() => { if (convertedForTarget !== null) setSourceValue(roundSensitivity(convertedForTarget)); setSource(target); setTarget(source); }}><Shuffle size={18} /></button>
          <div className="converter-side result">
            <small>目标</small>
            <SelectControl label="目标游戏" value={target} onChange={setTarget}>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</SelectControl>
            <strong>{convertedForTarget?.toFixed(3) ?? "—"}</strong>
            <span>{target === "neon" && draft.horizontalRatio !== 1 ? `已计入 X 轴倍率 ${draft.horizontalRatio.toFixed(2)}×` : targetProfile.status === "verified" ? "已验证换算" : "需要手动校准"}</span>
          </div>
        </div>
        <div className="converter-actions">
          <button type="button" onClick={() => void copyConverted()} disabled={convertedForTarget === null}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "已复制" : "复制结果"}</button>
          {target === "neon" && convertedForTarget !== null && <button type="button" className="primary" onClick={() => patch("sensitivity", roundSensitivity(convertedForTarget))}><Check size={16} />应用到 NEON AIM</button>}
        </div>
      </SettingsSection>
      <div className="converter-disclaimer">换算以鼠标腰射灵敏度和相同 cm/360 为准，不包含 ADS、瞄具倍率、鼠标加速或游戏内独立轴向倍率。</div>
    </>
  );

  const crosshairContent = (
    <>
      <div className="crosshair-workbench"><div><small>实时预览</small><TrainingCrosshair settings={draft} /></div><span>训练中的实际大小预览</span></div>
      <SettingsSection eyebrow="RETICLE" title="准星结构" description="选择容易辨认的准星样式，再调整当前样式支持的大小和间距。">
        <CrosshairTypePicker settings={draft} onChange={(value) => patch("crosshair", value)} />
        <SettingRow label="主颜色" help="同时用于普通命中确认" value={draft.crosshairColor.toUpperCase()}><label className="color-control"><input aria-label="准星主颜色" type="color" value={draft.crosshairColor} onChange={(event) => patch("crosshairColor", event.target.value)} /><span style={{ background: draft.crosshairColor }} /></label></SettingRow>
        {isDotCrosshair && <SettingRow label="圆点大小" help="控制中心圆点的实际像素直径" value={`${draft.crosshairThickness + 1}px`}><RangeControl label="准星圆点大小" value={draft.crosshairThickness} min={1} max={6} step={1} onChange={(value) => patch("crosshairThickness", value)} /></SettingRow>}
        {isCircleCrosshair && <SettingRow label="环线粗细" help="控制圆环边缘的像素宽度" value={`${draft.crosshairThickness}px`}><RangeControl label="准星环线粗细" value={draft.crosshairThickness} min={1} max={5} step={1} onChange={(value) => patch("crosshairThickness", value)} /></SettingRow>}
        {isCircleCrosshair && <SettingRow label="圆环直径" help="控制圆环外轮廓直径" value={`${draft.crosshairLength * 2}px`}><RangeControl label="准星圆环直径" value={draft.crosshairLength} min={3} max={16} step={1} onChange={(value) => patch("crosshairLength", value)} /></SettingRow>}
        {isLineCrosshair && <SettingRow label="线条粗细" help={draft.crosshair === "cross-dot" ? "同时控制线条宽度和中心点大小" : "准星横线与竖线的像素宽度"} value={`${draft.crosshairThickness}px`}><RangeControl label="准星线条粗细" value={draft.crosshairThickness} min={1} max={5} step={1} onChange={(value) => patch("crosshairThickness", value)} /></SettingRow>}
        {isLineCrosshair && <SettingRow label="线条长度" help="控制准星各方向线段的长度" value={`${draft.crosshairLength}px`}><RangeControl label="准星线条长度" value={draft.crosshairLength} min={2} max={20} step={1} onChange={(value) => patch("crosshairLength", value)} /></SettingRow>}
        {isLineCrosshair && <SettingRow label="中心间距" help="控制线段与瞄准中心之间的留白" value={`${draft.crosshairGap}px`}><RangeControl label="准星中心间距" value={draft.crosshairGap} min={0} max={14} step={1} onChange={(value) => patch("crosshairGap", value)} /></SettingRow>}
        <SettingRow label="准星透明度" help="只影响准星，不影响命中浮字" value={`${Math.round(draft.crosshairOpacity * 100)}%`}><RangeControl label="准星透明度" value={draft.crosshairOpacity} min={0.2} max={1} step={0.05} onChange={(value) => patch("crosshairOpacity", value)} /></SettingRow>
        <SettingRow label="命中确认环" help="命中时在准星附近显示短促脉冲"><Toggle label="命中确认环" checked={draft.showHitMarker} onChange={(value) => patch("showHitMarker", value)} /></SettingRow>
      </SettingsSection>
    </>
  );

  const graphicsContent = (
    <>
      <SettingsSection eyebrow="DISPLAY" title="画面设置" description="集中调整 FOV、画质预设、帧率和清晰度。大多数设备选择高画质和跟随显示器即可。">
        <div className="preset-grid">{(["low", "medium", "high", "ultra"] as const).map((preset) => <button type="button" className={draft.graphicsPreset === preset ? "active" : ""} onClick={() => setDraft((current) => applyGraphicsPreset(current, preset))} key={preset}><span>{preset === "low" ? "性能" : preset === "medium" ? "均衡" : preset === "high" ? "高画质" : "极致"}</span><small>{preset === "low" ? "优先流畅度" : preset === "medium" ? "清晰与性能平衡" : preset === "high" ? "清晰竞技画面" : "适合高分辨率屏幕"}</small>{draft.graphicsPreset === preset && <Check size={16} />}</button>)}</div>
        {draft.graphicsPreset === "custom" && <div className="custom-preset-note">自定义 · 已手动调整画面选项</div>}
        <SettingRow label="FOV" help="同时改变横向和纵向可见范围；数值越大，看到的区域越宽" value={`${draft.fov.toFixed(0)}°`}><RangeControl label="FOV" value={draft.fov} min={60} max={120} step={1} onChange={(value) => patchGraphics("fov", value)} /></SettingRow>
        <SettingRow label="FPS 上限" help="通常建议选择“跟随显示器”，也可以限制帧率以降低显卡占用"><SelectControl label="FPS 上限" value={draft.fpsLimit} onChange={(value) => patchGraphics("fpsLimit", (value === "auto" ? "auto" : Number(value)) as FpsLimit)}>{FPS_OPTIONS.filter((option) => option !== "unlimited").map((option) => <option value={option} key={option}>{option === "auto" ? "跟随显示器" : `${option} FPS`}</option>)}</SelectControl></SettingRow>
        <SettingRow label="渲染比例" help="降低可提升流畅度，提高可让目标和场景边缘更清晰" value={`${Math.round(draft.renderScale * 100)}%`}><SelectControl label="渲染比例" value={draft.renderScale} onChange={(value) => patchGraphics("renderScale", Number(value))}>{[0.5, 0.67, 0.75, 0.85, 1, 1.1, 1.25].map((value) => <option value={value} key={value}>{Math.round(value * 100)}%</option>)}</SelectControl></SettingRow>
        <SettingRow label="高分屏清晰度" help="高分辨率屏幕可适当提高；选择自动即可适配大多数设备" value={`${effectiveDpr.toFixed(2)}×`}><SelectControl label="高分屏清晰度" value={draft.dprMode} onChange={(value) => patchGraphics("dprMode", value === "auto" ? "auto" : Number(value) as 1)}>{["auto", 1, 1.25, 1.5, 1.75, 2].map((value) => <option value={value} key={value}>{value === "auto" ? "自动" : `${value}×`}</option>)}</SelectControl></SettingRow>
        <div className="render-readout"><span>预计渲染分辨率</span><strong>{Math.round(innerWidth * effectiveDpr)} × {Math.round(innerHeight * effectiveDpr)}</strong><small>进入全屏训练后会根据屏幕尺寸自动调整</small></div>
      </SettingsSection>
      <SettingsSection eyebrow="VISUAL EFFECTS" title="视觉效果" description="集中控制影响性能的场景效果。关闭这些选项不会改变灵敏度、目标大小或计分。">
        <SettingRow label="抗锯齿" help="减少目标和场景边缘的锯齿；关闭后可略微降低显卡占用"><Toggle label="抗锯齿" checked={draft.antialiasEnabled} onChange={(value) => patchGraphics("antialiasEnabled", value)} /></SettingRow>
        <SettingRow label="灯光层次" help="完整模式拥有更丰富的空间光照；精简模式优先保证流畅度"><Segmented label="灯光层次" value={draft.lowSpec ? "lean" : "full"} options={[{ value: "lean", label: "精简" }, { value: "full", label: "完整" }]} onChange={(value) => patchGraphics("lowSpec", value === "lean")} /></SettingRow>
        <SettingRow label="命中粒子" help="控制命中目标时粒子效果的数量"><Segmented label="命中粒子" value={draft.particleQuality} options={[{ value: "off", label: "关闭" }, { value: "low", label: "少量" }, { value: "high", label: "完整" }]} onChange={(value) => patchGraphics("particleQuality", value)} /></SettingRow>
        <SettingRow label="环境雾" help="启用训练舱远景深度雾"><Toggle label="环境雾" checked={draft.fogEnabled} onChange={(value) => patchGraphics("fogEnabled", value)} /></SettingRow>
        <SettingRow label="地面参考网格" help="显示低对比度距离参考"><Toggle label="地面参考网格" checked={draft.dynamicGridEnabled} onChange={(value) => patchGraphics("dynamicGridEnabled", value)} /></SettingRow>
      </SettingsSection>
    </>
  );

  const hudContent = (
    <SettingsSection eyebrow="TRAINING READOUT" title="训练显示" description="调整训练中的成绩信息和目标外观。所有更改都会用于下一次训练。">
      <SettingRow label="HUD 缩放" help="统一缩放成绩、计时和FPS信息" value={`${Math.round(draft.hudScale * 100)}%`}><RangeControl label="HUD 缩放" value={draft.hudScale} min={0.7} max={1.4} step={0.05} onChange={(value) => patch("hudScale", value)} /></SettingRow>
      <SettingRow label="HUD 透明度" help="不影响准星和目标" value={`${Math.round(draft.hudOpacity * 100)}%`}><RangeControl label="HUD 透明度" value={draft.hudOpacity} min={0.2} max={1} step={0.05} onChange={(value) => patch("hudOpacity", value)} /></SettingRow>
      <SettingRow label="性能信息" help="在右下角显示FPS与帧时间"><Toggle label="显示性能信息" checked={draft.showFps} onChange={(value) => patch("showFps", value)} /></SettingRow>
      <SettingRow label="目标颜色" help="修改正式目标主体材质" value={draft.targetColor.toUpperCase()}><label className="color-control"><input aria-label="目标颜色" type="color" value={draft.targetColor} onChange={(event) => patch("targetColor", event.target.value)} /><span style={{ background: draft.targetColor }} /></label></SettingRow>
      <SettingRow label="目标大小" help="同时调整目标的显示大小和可命中范围" value={`${draft.targetSize.toFixed(2)}×`}><RangeControl label="目标大小" value={draft.targetSize} min={0.7} max={1.4} step={0.05} onChange={(value) => patch("targetSize", value)} /></SettingRow>
    </SettingsSection>
  );

  const audioContent = (
    <SettingsSection eyebrow="FEEDBACK MIX" title="训练音频" description="命中、Miss和Combo拥有独立通道，倒计时与结束提示只跟随总音量。">
      <SettingRow label="总音量" help="所有训练音效的主增益" value={`${Math.round(draft.volume * 100)}%`}><RangeControl label="总音量" value={draft.volume} min={0} max={1} step={0.05} onChange={(value) => patch("volume", value)} /></SettingRow>
      <SettingRow label="命中音量" help="普通命中与快速命中" value={`${Math.round(draft.hitVolume * 100)}%`}><RangeControl label="命中音量" value={draft.hitVolume} min={0} max={1} step={0.05} onChange={(value) => patch("hitVolume", value)} /></SettingRow>
      <SettingRow label="Miss 音量" help="射空与Combo中断反馈" value={`${Math.round(draft.missVolume * 100)}%`}><RangeControl label="Miss 音量" value={draft.missVolume} min={0} max={1} step={0.05} onChange={(value) => patch("missVolume", value)} /></SettingRow>
      <SettingRow label="Combo 音量" help="里程碑与纪录节奏提示" value={`${Math.round(draft.comboVolume * 100)}%`}><RangeControl label="Combo 音量" value={draft.comboVolume} min={0} max={1} step={0.05} onChange={(value) => patch("comboVolume", value)} /></SettingRow>
      <SettingRow label="全部静音" help="停止创建和播放新的训练声音"><Toggle label="全部静音" checked={draft.muted} onChange={(value) => patch("muted", value)} /></SettingRow>
    </SettingsSection>
  );

  const content = tab === "input" ? inputContent : tab === "crosshair" ? crosshairContent : tab === "graphics" ? graphicsContent : tab === "hud" ? hudContent : tab === "audio" ? audioContent : <div className="settings-empty"><span>{tab === "accessibility" ? <Accessibility /> : <Database />}</span><small>COMING SOON</small><h3>{tab === "accessibility" ? "辅助功能" : "数据管理"}</h3><p>这部分功能仍在准备中，开放后会在这里提供设置。</p></div>;

  return (
    <main className="settings-workspace">
      <header className="settings-titlebar"><div><small>PLAYER SETTINGS</small><h1>设置</h1><p>调整控制、画面、准星和声音，让训练更符合你的习惯。</p></div></header>
      <div className="settings-shell">
        <nav className="settings-tabs" aria-label="设置分类">{tabs.map((item) => { const Icon = item.icon; return <button type="button" className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)} key={item.id}><Icon size={18} /><span><b>{item.label}</b><small>{item.note}</small></span></button>; })}</nav>
        <section className="settings-content">{content}</section>
        <SettingsPreview tab={tab} settings={draft} effectiveDpr={effectiveDpr} />
      </div>
      <div className="settings-actions"><div><span className={changed ? "dirty" : ""} />{changed ? `已修改 ${changedKeys.length} 项` : "所有更改均已保存"}</div><button type="button" onClick={() => setDraft(settings)} disabled={!changed}><Undo2 size={16} />撤销修改</button><button type="button" onClick={resetCategory} disabled={tab === "accessibility" || tab === "data"}><RotateCcw size={16} />恢复本类默认</button><button type="button" className="primary" disabled={!changed} onClick={apply}><Check size={17} />保存设置</button></div>
      {confirm > 0 && <div className="graphics-confirm"><small>DISPLAY SAFETY</small><h3>保留新的画面设置？</h3><strong>{confirm}</strong><p>倒计时结束将恢复应用前的画面配置。</p><div><button type="button" className="primary" onClick={() => setConfirm(0)}>保留设置</button><button type="button" onClick={() => { onApply(rollbackRef.current); setDraft(rollbackRef.current); setConfirm(0); }}>恢复旧设置</button></div></div>}
    </main>
  );
}
