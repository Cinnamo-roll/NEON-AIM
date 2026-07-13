import type { CSSProperties } from "react";
import type { TrainingSettings } from "../../game/types/training";

export function TrainingCrosshair({ settings, hit = false, fast = false }: { settings: TrainingSettings; hit?: boolean; fast?: boolean }) {
  return <div className={`training-crosshair ${hit ? "is-hit" : ""} ${fast ? "is-fast" : ""}`} style={{ "--cross-color": settings.crosshairColor, "--cross-thickness": `${settings.crosshairThickness}px`, "--cross-length": `${settings.crosshairLength}px`, "--cross-gap": `${settings.crosshairGap}px`, "--cross-dot-size": `${settings.crosshairDotSize}px`, "--cross-ring-diameter": `${settings.crosshairRingDiameter}px`, opacity: settings.crosshairOpacity } as CSSProperties}>
    {settings.crosshairLeft && <i className="crosshair-arm arm-left" />}
    {settings.crosshairRight && <i className="crosshair-arm arm-right" />}
    {settings.crosshairTop && <i className="crosshair-arm arm-top" />}
    {settings.crosshairBottom && <i className="crosshair-arm arm-bottom" />}
    {settings.crosshairCenterDot && <b className="crosshair-center-dot" />}
    {settings.crosshairRing && <span className="crosshair-ring" />}
  </div>;
}
