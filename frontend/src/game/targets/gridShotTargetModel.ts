import type { TargetState } from "../types/training";

export const GRID_SHOT_ACTIVE_TARGETS = 3;
export const GRID_SHOT_POOL_SIZE = 10;
export const GRID_SHOT_HIT_EFFECT_DURATION_MS = 300;

export interface GridShotTargetModel {
  id: number;
  poolIndex: number;
  state: TargetState;
  bodyVisible: boolean;
  bodyOpacity: number;
  bodyScale: number;
  ringVisible: boolean;
  colliderVisible: boolean;
  colliderRegistered: boolean;
  spawnProgress: number;
  hitProgress: number;
  despawnProgress: number;
}

export interface GridShotTargetCounts {
  poolSize: number;
  inactive: number;
  spawning: number;
  active: number;
  hit: number;
  despawning: number;
  visibleTargetBodies: number;
  activeColliders: number;
  visuallyClickableTargets: number;
}

export const createTargetPool = (size = GRID_SHOT_POOL_SIZE): GridShotTargetModel[] =>
  Array.from({ length: size }, (_, id) => ({ id, poolIndex: id, state: "inactive", bodyVisible: false, bodyOpacity: 0, bodyScale: 0, ringVisible: false, colliderVisible: false, colliderRegistered: false, spawnProgress: 0, hitProgress: 0, despawnProgress: 0 }));

export function resetTarget(target: GridShotTargetModel) {
  Object.assign(target, { state: "inactive", bodyVisible: false, bodyOpacity: 0, bodyScale: 0, ringVisible: false, colliderVisible: false, colliderRegistered: false, spawnProgress: 0, hitProgress: 0, despawnProgress: 0 });
}

export function activateTarget(target: GridShotTargetModel) {
  Object.assign(target, { state: "active", bodyVisible: true, bodyOpacity: 0, bodyScale: 0.68, ringVisible: true, colliderVisible: true, colliderRegistered: true, spawnProgress: 0, hitProgress: 0, despawnProgress: 0 });
}

export function initializeThreeTargets(pool: GridShotTargetModel[]) {
  pool.forEach(resetTarget);
  pool.slice(0, GRID_SHOT_ACTIVE_TARGETS).forEach(activateTarget);
}

export function hitAndReplace(pool: GridShotTargetModel[], target: GridShotTargetModel) {
  if (target.state !== "active" || !target.colliderRegistered) return false;
  Object.assign(target, { state: "hit", bodyScale: 0.8, bodyOpacity: 1, ringVisible: false, colliderVisible: false, colliderRegistered: false, hitProgress: 0 });
  const replacement = pool.find((candidate) => candidate.state === "inactive");
  if (replacement) activateTarget(replacement);
  return true;
}

export function advanceTargetVisual(target: GridShotTargetModel, deltaMs: number) {
  if (target.state === "active" && target.spawnProgress < 1) {
    target.spawnProgress = Math.min(1, target.spawnProgress + deltaMs / 150);
    const progress = target.spawnProgress;
    const eased = 1 - Math.pow(1 - Math.min(1, progress / 0.72), 3);
    target.bodyScale = progress < 0.72
      ? 0.68 + (1.08 - 0.68) * eased
      : 1.08 + (1 - 1.08) * ((progress - 0.72) / 0.28);
    target.bodyOpacity = Math.min(1, progress / 0.28);
    return;
  }
  if (target.state !== "hit" && target.state !== "despawning") return;
  target.hitProgress = Math.min(1, target.hitProgress + deltaMs / GRID_SHOT_HIT_EFFECT_DURATION_MS);
  target.despawnProgress = target.hitProgress;
  target.state = target.hitProgress < 0.55 ? "hit" : "despawning";
  target.bodyScale = 0.8 * (1 - target.hitProgress);
  target.bodyOpacity = 1 - target.hitProgress;
  if (target.hitProgress >= 1) resetTarget(target);
}

export const isVisuallyClickable = (target: GridShotTargetModel) => target.state === "active" && target.bodyVisible && target.colliderRegistered && target.ringVisible;

export function getTargetCounts(targets: GridShotTargetModel[]): GridShotTargetCounts {
  return { poolSize: targets.length, inactive: targets.filter((t) => t.state === "inactive").length, spawning: targets.filter((t) => t.state === "spawning").length, active: targets.filter((t) => t.state === "active").length, hit: targets.filter((t) => t.state === "hit").length, despawning: targets.filter((t) => t.state === "despawning").length, visibleTargetBodies: targets.filter((t) => t.bodyVisible).length, activeColliders: targets.filter((t) => t.colliderVisible && t.colliderRegistered).length, visuallyClickableTargets: targets.filter(isVisuallyClickable).length };
}

export function assertGridShotTargetInvariants(targets: GridShotTargetModel[]) {
  const counts = getTargetCounts(targets);
  if (counts.visuallyClickableTargets > GRID_SHOT_ACTIVE_TARGETS) throw new Error("More than three visually clickable targets");
  if (counts.activeColliders !== counts.active) throw new Error("Collider and active counts diverged");
  if (counts.active !== GRID_SHOT_ACTIVE_TARGETS) throw new Error("Grid Shot must maintain three active targets");
  return counts;
}
