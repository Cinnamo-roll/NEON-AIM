import { Check, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import {
  DEFAULT_GRID_SHOT_SETTINGS,
  GRID_SHOT_SCENES,
  GRID_SHOT_TARGET_SIZES,
  getGridShotTargetSize,
  type GridShotDuration,
  type GridShotHitEffectStyle,
  type GridShotModeSettings,
} from "../../game/modes/gridShot/gridShotConfig";
import { tx } from "../../i18n";
import { GridShotSettingsPreview } from "./GridShotSettingsPreview";

type GridShotModeSettingsPanelProps = {
  settings: GridShotModeSettings;
  onApply: (settings: GridShotModeSettings) => void;
  onClose: () => void;
};

const DURATIONS: GridShotDuration[] = [30, 60, 90];
const EFFECT_STYLES: Array<{ value: GridShotHitEffectStyle; zh: string; en: string; noteZh: string; noteEn: string }> = [
  { value: "off", zh: "关闭", en: "Off", noteZh: "不显示命中特效", noteEn: "No hit effect" },
  { value: "radial", zh: "放射", en: "Radial", noteZh: "光束直线向外散开", noteEn: "Beams expand outward" },
  { value: "shards", zh: "碎光", en: "Shards", noteZh: "碎片不规则飞散", noteEn: "Irregular light fragments" },
  { value: "spiral", zh: "涡旋", en: "Spiral", noteZh: "粒子旋转向外展开", noteEn: "Particles spiral outward" },
];
const FEEDBACK_VOLUMES: Array<{
  key: "hitVolume" | "missVolume" | "comboVolume";
  zh: string;
  en: string;
}> = [
  { key: "hitVolume", zh: "命中", en: "Hit" },
  { key: "missVolume", zh: "未命中", en: "Miss" },
  { key: "comboVolume", zh: "连击", en: "Combo" },
];

const sceneCopy = { name: ["训练舱", "Training chamber"], description: ["低干扰竞技训练空间，强调目标轮廓与连续点击节奏。", "A low-distraction arena focused on target clarity and clicking rhythm."] } as const;
const targetSizeCopy = {
  small: { label: ["小", "Small"], note: ["精准挑战", "Precision challenge"] },
  medium: { label: ["中", "Medium"], note: ["标准尺寸", "Standard size"] },
  large: { label: ["大", "Large"], note: ["快速热身", "Quick warm-up"] },
} as const;

export function GridShotModeSettingsPanel({ settings, onApply, onClose }: GridShotModeSettingsPanelProps) {
  const [draft, setDraft] = useState(settings);
  const [previewTick, setPreviewTick] = useState(0);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(settings), [settings]);
  const changed = (Object.keys(draft) as Array<keyof GridShotModeSettings>)
    .some((key) => draft[key] !== settings[key]);
  const targetSize = getGridShotTargetSize(draft.targetSize);
  const save = () => {
    onApply({ ...draft });
    setSaved(true);
    window.setTimeout(onClose, 420);
  };

  return (
    <div className="grid-shot-mode-settings-backdrop" role="dialog" aria-modal="true" aria-label={tx("训练设置", "Training settings")}>
      <section className="grid-shot-mode-settings-panel">
        <header>
          <div>
            <h2>{tx("训练设置", "Training settings")}</h2>
          </div>
          <button type="button" className="icon-button" aria-label={tx("关闭训练设置", "Close training settings")} onClick={onClose}><X size={19} /></button>
        </header>

        <div className="grid-shot-training-preview">
          <div className="grid-shot-preview-heading">
            <div><b>{tx("预览", "Preview")}</b></div>
            <button type="button" onClick={() => setPreviewTick((tick) => tick + 1)}><Sparkles size={15} />{tx("预览命中反馈", "Preview hit feedback")}</button>
          </div>
          <div
            className="grid-shot-preview-stage"
            style={{
              "--effect-preview-glow": draft.screenGlow,
            } as CSSProperties}
          >
            <GridShotSettingsPreview modeSettings={draft} focusTarget impactTick={previewTick || undefined} />
            <div className="grid-shot-preview-feedback" aria-hidden="true">
              <i className="effect-preview-vignette" key={`glow-${previewTick}`} />
            </div>
            <span className="grid-shot-preview-scene-label">{tx(sceneCopy.name[0], sceneCopy.name[1])} · {tx(targetSizeCopy[targetSize.id].label[0], targetSizeCopy[targetSize.id].label[1])} {tx("型目标", "targets")}</span>
          </div>
        </div>

        <div className="grid-shot-mode-setting-row scene-setting">
          <div><b>{tx("训练场景", "Training scene")}</b></div>
          <div className="grid-shot-scene-options">
            {GRID_SHOT_SCENES.map((option) => (
              <button type="button" className={draft.sceneId === option.id ? "active" : ""} aria-pressed={draft.sceneId === option.id} onClick={() => setDraft((current) => ({ ...current, sceneId: option.id }))} key={option.id}>
                <span className="scene-swatch" />
                <span><b>{tx(...sceneCopy.name)}</b><small>{tx(...sceneCopy.description)}</small></span>
                {draft.sceneId === option.id && <Check size={16} />}
              </button>
            ))}
            <div className="scene-slot-future"><span>+</span><small>{tx("预留", "Reserved")}</small></div>
          </div>
        </div>

        <div className="grid-shot-mode-setting-row">
          <div><b>{tx("训练时长", "Duration")}</b></div>
          <div className="grid-shot-duration-options" role="group" aria-label={tx("训练时长", "Duration")}>
            {DURATIONS.map((duration) => (
              <button type="button" className={draft.duration === duration ? "active" : ""} aria-pressed={draft.duration === duration} onClick={() => setDraft((current) => ({ ...current, duration }))} key={duration}>
                {duration}<small>{tx("秒", "sec")}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="grid-shot-mode-setting-row target-size-setting">
          <div><b>{tx("目标尺寸", "Target size")}</b></div>
          <div className="grid-shot-target-size-options" role="group" aria-label={tx("目标尺寸", "Target size")}>
            {GRID_SHOT_TARGET_SIZES.map((option) => (
              <button type="button" className={draft.targetSize === option.id ? "active" : ""} aria-pressed={draft.targetSize === option.id} onClick={() => { setDraft((current) => ({ ...current, targetSize: option.id })); setPreviewTick((tick) => tick + 1); }} key={option.id}>
                <b>{tx(targetSizeCopy[option.id].label[0], targetSizeCopy[option.id].label[1])}</b><small>{tx(targetSizeCopy[option.id].note[0], targetSizeCopy[option.id].note[1])}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="grid-shot-mode-setting-row hit-effect-setting">
          <div><b>{tx("命中特效", "Hit effect")}</b></div>
          <div className="grid-shot-effect-options" role="group" aria-label={tx("命中特效样式", "Hit effect style")}>
            {EFFECT_STYLES.map((style) => (
              <button type="button" className={draft.hitEffectStyle === style.value ? "active" : ""} aria-pressed={draft.hitEffectStyle === style.value} onClick={() => { setDraft((current) => ({ ...current, hitEffectStyle: style.value })); setPreviewTick((tick) => tick + 1); }} key={style.value}>
                <b>{tx(style.zh, style.en)}</b><small>{tx(style.noteZh, style.noteEn)}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="grid-shot-mode-setting-row screen-glow-setting">
          <div><b>{tx("屏幕边缘辉光", "Screen edge glow")}</b></div>
          <div className="grid-shot-target-size-control">
            <output>{Math.round(draft.screenGlow * 100)}%</output>
            <input type="range" aria-label={tx("屏幕边缘辉光", "Screen edge glow")} min={0} max={1} step={0.05} value={draft.screenGlow} style={{ "--target-size-progress": `${draft.screenGlow * 100}%` } as CSSProperties} onChange={(event) => { setDraft((current) => ({ ...current, screenGlow: Number(event.target.value) })); setPreviewTick((tick) => tick + 1); }} />
            <div><span>{tx("关闭", "Off")}</span><span>{tx("明显", "Strong")}</span></div>
          </div>
        </div>

        <div className="grid-shot-mode-setting-row feedback-volume-setting">
          <div><b>{tx("反馈音效", "Feedback audio")}</b></div>
          <div className="grid-shot-feedback-volumes">
            {FEEDBACK_VOLUMES.map(({ key, zh, en }) => (
              <label key={key}>
                <span>{tx(zh, en)}<output>{Math.round(draft[key] * 100)}%</output></span>
                <input type="range" aria-label={`${tx(zh, en)} ${tx("音量", "volume")}`} min={0} max={1} step={0.05} value={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: Number(event.target.value) }))} />
              </label>
            ))}
          </div>
        </div>

        <footer>
          <span>{saved ? tx("已保存", "Saved") : changed ? tx("有未保存的修改", "Unsaved changes") : ""}</span>
          <button type="button" onClick={() => { setDraft(DEFAULT_GRID_SHOT_SETTINGS); setPreviewTick((tick) => tick + 1); }}><RotateCcw size={16} />{tx("恢复默认", "Reset defaults")}</button>
          <button type="button" onClick={onClose}>{tx("取消", "Cancel")}</button>
          <button type="button" className="primary" disabled={!changed || saved} onClick={save}><Check size={16} />{saved ? tx("已保存", "Saved") : tx("保存训练设置", "Save training settings")}</button>
        </footer>
      </section>
    </div>
  );
}
