import { Check, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import {
  DEFAULT_GRID_SHOT_SETTINGS,
  GRID_SHOT_SCENES,
  GRID_SHOT_TARGET_SIZES,
  getGridShotScene,
  getGridShotTargetSize,
  type GridShotDuration,
  type GridShotHitEffectStyle,
  type GridShotModeSettings,
} from "../../game/modes/gridShot/gridShotConfig";
import { GridShotSettingsPreview } from "./GridShotSettingsPreview";

type GridShotModeSettingsPanelProps = {
  settings: GridShotModeSettings;
  onApply: (settings: GridShotModeSettings) => void;
  onClose: () => void;
};

const DURATIONS: GridShotDuration[] = [30, 60, 90];
const EFFECT_STYLES: Array<{ value: GridShotHitEffectStyle; label: string; note: string }> = [
  { value: "off", label: "关闭", note: "不显示命中特效" },
  { value: "radial", label: "放射", note: "光束直线向外散开" },
  { value: "shards", label: "碎光", note: "碎片不规则飞散" },
  { value: "spiral", label: "涡旋", note: "粒子旋转向外展开" },
];
const FEEDBACK_VOLUMES: Array<{
  key: "hitVolume" | "missVolume" | "comboVolume";
  label: string;
}> = [
  { key: "hitVolume", label: "命中" },
  { key: "missVolume", label: "未命中" },
  { key: "comboVolume", label: "连击" },
];

export function GridShotModeSettingsPanel({ settings, onApply, onClose }: GridShotModeSettingsPanelProps) {
  const [draft, setDraft] = useState(settings);
  const [previewTick, setPreviewTick] = useState(0);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(settings), [settings]);
  const changed = (Object.keys(draft) as Array<keyof GridShotModeSettings>)
    .some((key) => draft[key] !== settings[key]);
  const scene = getGridShotScene(draft.sceneId);
  const targetSize = getGridShotTargetSize(draft.targetSize);
  const save = () => {
    onApply({ ...draft });
    setSaved(true);
    window.setTimeout(onClose, 420);
  };

  return (
    <div className="grid-shot-mode-settings-backdrop" role="dialog" aria-modal="true" aria-label="GRID SHOT 训练设置">
      <section className="grid-shot-mode-settings-panel">
        <header>
          <div>
            <small>GRID SHOT · TRAINING CONFIG</small>
            <h2>训练设置</h2>
            <p>在开始前选好训练时长、目标大小和反馈强度。</p>
          </div>
          <button type="button" className="icon-button" aria-label="关闭训练设置" onClick={onClose}><X size={19} /></button>
        </header>

        <div className="grid-shot-training-preview">
          <div className="grid-shot-preview-heading">
            <div><b>训练预览</b><small>当前场景、目标尺寸和命中反馈都会在这里同步显示。</small></div>
            <button type="button" onClick={() => setPreviewTick((tick) => tick + 1)}><Sparkles size={15} />预览命中反馈</button>
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
            <span className="grid-shot-preview-scene-label">{scene.name} · {targetSize.label}型目标</span>
          </div>
        </div>

        <div className="grid-shot-mode-setting-row scene-setting">
          <div><b>训练场景</b><small>不同场景拥有各自的环境、标靶和命中效果。</small></div>
          <div className="grid-shot-scene-options">
            {GRID_SHOT_SCENES.map((option) => (
              <button type="button" className={draft.sceneId === option.id ? "active" : ""} aria-pressed={draft.sceneId === option.id} onClick={() => setDraft((current) => ({ ...current, sceneId: option.id }))} key={option.id}>
                <span className="scene-swatch" />
                <span><b>{option.name}</b><small>{option.description}</small></span>
                {draft.sceneId === option.id && <Check size={16} />}
              </button>
            ))}
            <div className="scene-slot-future"><span>+</span><small>更多场景敬请期待</small></div>
          </div>
        </div>

        <div className="grid-shot-mode-setting-row">
          <div><b>训练时长</b><small>本次训练的倒计时时长，只能在开始前修改。</small></div>
          <div className="grid-shot-duration-options" role="group" aria-label="训练时长">
            {DURATIONS.map((duration) => (
              <button type="button" className={draft.duration === duration ? "active" : ""} aria-pressed={draft.duration === duration} onClick={() => setDraft((current) => ({ ...current, duration }))} key={duration}>
                {duration}<small>秒</small>
              </button>
            ))}
          </div>
        </div>

        <div className="grid-shot-mode-setting-row target-size-setting">
          <div><b>目标尺寸</b><small>固定为小、中、大三个档位，便于后续区分训练成绩。</small></div>
          <div className="grid-shot-target-size-options" role="group" aria-label="GRID SHOT 目标尺寸">
            {GRID_SHOT_TARGET_SIZES.map((option) => (
              <button type="button" className={draft.targetSize === option.id ? "active" : ""} aria-pressed={draft.targetSize === option.id} onClick={() => { setDraft((current) => ({ ...current, targetSize: option.id })); setPreviewTick((tick) => tick + 1); }} key={option.id}>
                <b>{option.label}</b><small>{option.note}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="grid-shot-mode-setting-row hit-effect-setting">
          <div><b>命中特效</b><small>选择粒子的运动形态，颜色会跟随“{scene.name}”的主题。</small></div>
          <div className="grid-shot-effect-options" role="group" aria-label="命中特效样式">
            {EFFECT_STYLES.map((style) => (
              <button type="button" className={draft.hitEffectStyle === style.value ? "active" : ""} aria-pressed={draft.hitEffectStyle === style.value} onClick={() => { setDraft((current) => ({ ...current, hitEffectStyle: style.value })); setPreviewTick((tick) => tick + 1); }} key={style.value}>
                <b>{style.label}</b><small>{style.note}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="grid-shot-mode-setting-row screen-glow-setting">
          <div><b>屏幕边缘辉光</b><small>命中时从屏幕边缘给出短促确认，不遮挡中心目标。</small></div>
          <div className="grid-shot-target-size-control">
            <output>{Math.round(draft.screenGlow * 100)}%</output>
            <input type="range" aria-label="屏幕边缘辉光" min={0} max={1} step={0.05} value={draft.screenGlow} style={{ "--target-size-progress": `${draft.screenGlow * 100}%` } as CSSProperties} onChange={(event) => { setDraft((current) => ({ ...current, screenGlow: Number(event.target.value) })); setPreviewTick((tick) => tick + 1); }} />
            <div><span>关闭</span><span>明显</span></div>
          </div>
        </div>

        <div className="grid-shot-mode-setting-row feedback-volume-setting">
          <div><b>反馈音效</b><small>分别控制 GRID SHOT 的命中、失误与连击提示音。</small></div>
          <div className="grid-shot-feedback-volumes">
            {FEEDBACK_VOLUMES.map(({ key, label }) => (
              <label key={key}>
                <span>{label}<output>{Math.round(draft[key] * 100)}%</output></span>
                <input type="range" aria-label={`${label}音量`} min={0} max={1} step={0.05} value={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: Number(event.target.value) }))} />
              </label>
            ))}
          </div>
        </div>

        <footer>
          <span>{saved ? "训练设置已保存，即将返回" : changed ? "有未保存的训练设置" : "训练设置已保存"}</span>
          <button type="button" onClick={() => { setDraft(DEFAULT_GRID_SHOT_SETTINGS); setPreviewTick((tick) => tick + 1); }}><RotateCcw size={16} />恢复默认</button>
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" className="primary" disabled={!changed || saved} onClick={save}><Check size={16} />{saved ? "已保存" : "保存训练设置"}</button>
        </footer>
      </section>
    </div>
  );
}
