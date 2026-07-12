import type { CSSProperties } from "react";
import type { TrainingSettings } from "../../game/types/training";

export function TrainingCrosshair({ settings, hit = false, fast = false }: { settings: TrainingSettings; hit?: boolean; fast?: boolean }) {
  return <div className={`training-crosshair ${settings.crosshair} ${hit ? "is-hit" : ""} ${fast ? "is-fast" : ""}`} style={{ "--cross-color": settings.crosshairColor, "--cross-thickness": `${settings.crosshairThickness}px`, "--cross-length": `${settings.crosshairLength}px`, "--cross-gap": `${settings.crosshairGap}px`, opacity: settings.crosshairOpacity } as CSSProperties}>
    <i /><i /><i /><i /><b />
    {settings.showHitMarker && hit && <em className="crosshair-hit-pulse" />}
  </div>;
}
