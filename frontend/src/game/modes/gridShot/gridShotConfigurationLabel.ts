import { formatSeconds, tx } from "../../../i18n";
import type { GridShotTargetSize } from "./gridShotConfig";

const targetSizeLabels: Record<GridShotTargetSize, readonly [chinese: string, english: string]> = {
  small: ["小目标", "Small targets"],
  medium: ["中目标", "Medium targets"],
  large: ["大目标", "Large targets"],
};

function isGridShotTargetSize(value: string): value is GridShotTargetSize {
  return value === "small" || value === "medium" || value === "large";
}

export function formatGridShotTargetSizeLabel(value: string) {
  return isGridShotTargetSize(value)
    ? tx(...targetSizeLabels[value])
    : tx("未知目标", "Unknown targets");
}

export function formatGridShotConfigurationLabel(configurationKey: string) {
  const [, durationToken = "", targetSize = ""] = configurationKey.split(":");
  const duration = Number.parseInt(durationToken, 10);
  const durationLabel = Number.isFinite(duration) ? formatSeconds(duration) : "-";
  return `${durationLabel} · ${formatGridShotTargetSizeLabel(targetSize)}`;
}
