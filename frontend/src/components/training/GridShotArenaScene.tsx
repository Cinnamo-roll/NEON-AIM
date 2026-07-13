import { Grid, PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { createNeonInputSensitivity } from "../../game/sensitivity/sensitivity";
import {
  PointerLockInputController,
  type PointerInputMode,
  type PointerInputDebugSnapshot,
} from "../../game/input/PointerLockInputController";
import {
  activateTarget,
  advanceTargetVisual,
  assertGridShotTargetInvariants,
  createTargetPool,
  getTargetCounts,
  hitAndReplace,
  initializeThreeTargets,
  type GridShotTargetCounts,
  type GridShotTargetModel,
} from "../../game/targets/gridShotTargetModel";
import type { TrainingSettings, TrainingState } from "../../game/types/training";

const ACTIVE_TARGET_COUNT = 3;
const TARGET_Z_MIN = -6.15;
const TARGET_Z_MAX = -5.78;
const CENTER_RAY = new THREE.Vector2(0, 0);
const SAFE_POSITIONS = [
  [-3.45, 1.25, -5.9],
  [0, -0.2, -5.86],
  [3.45, -1.15, -5.94],
  [-2.3, -1.9, -5.84],
  [2.35, 1.9, -6.02],
] as const;
const PANEL_POSITIONS = Array.from({ length: 15 }, (_, index) => ({
  x: (index % 5 - 2) * 2.48,
  y: (1 - Math.floor(index / 5)) * 2.28 + 0.12,
}));
const CEILING_RIBS = [-0.25, -1.85, -3.45, -5.05, -6.65];
const PARTICLE_DIRECTIONS = [
  [-0.88, 0.22], [-0.62, 0.72], [-0.08, 0.94], [0.52, 0.77],
  [0.94, 0.18], [0.72, -0.62], [0.08, -0.92], [-0.7, -0.62],
] as const;

type SceneTarget = GridShotTargetModel & {
  position: THREE.Vector3;
  bornAt: number;
  hitAt: number;
  hitAccent: "normal" | "fast";
};

export interface ShotVisualOutcome {
  fast: boolean;
}

export interface GridShotShotMetadata {
  timestamp: number;
  targetId?: number;
  targetActivatedAt?: number;
}

export interface GridShotInputLifecycle {
  onPointerLockChanged: (locked: boolean) => void;
  onFullscreenChanged: (fullscreen: boolean) => void;
  onFocusChanged: (focused: boolean) => void;
  onVisibilityChanged: (visible: boolean) => void;
}

export type SceneDiagnostics = {
  counts: GridShotTargetCounts;
  targets: Array<GridShotTargetModel & { rootVisible: boolean }>;
};

export type GridShotSceneApi = {
  simulateHit: (forcedInterval?: number) => boolean;
  getDiagnostics: () => SceneDiagnostics;
  getInputDebugSnapshot: () => PointerInputDebugSnapshot;
};

type ArenaSceneProps = {
  state: TrainingState;
  settings: TrainingSettings;
  visualMode: boolean;
  debugInput: boolean;
  pointerInputMode: PointerInputMode;
  inputLifecycle: GridShotInputLifecycle;
  onShot: (
    hit: boolean,
    reaction: number,
    forcedInterval?: number,
    metadata?: GridShotShotMetadata,
  ) => ShotVisualOutcome | void;
};

type TargetRefs = {
  root: Array<THREE.Group | null>;
  body: Array<THREE.Mesh | null>;
  core: Array<THREE.Mesh | null>;
  contour: Array<THREE.Mesh | null>;
  statusRing: Array<THREE.Mesh | null>;
  spawnRing: Array<THREE.Mesh | null>;
  collider: Array<THREE.Mesh | null>;
  impact: Array<THREE.Mesh | null>;
  particles: Array<THREE.Group | null>;
};

function makeScenePool(): SceneTarget[] {
  const pool = createTargetPool().map((target) => ({
    ...target,
    position: new THREE.Vector3(0, 0, -5.9),
    bornAt: 0,
    hitAt: 0,
    hitAccent: "normal" as const,
  }));
  initializeThreeTargets(pool);
  pool.slice(0, ACTIVE_TARGET_COUNT).forEach((target, index) => {
    const position = SAFE_POSITIONS[index];
    target.position.set(position[0], position[1], position[2]);
    target.bornAt = performance.now();
  });
  return pool;
}

function placeTarget(target: SceneTarget, pool: SceneTarget[]) {
  let found = false;
  for (let attempt = 0; attempt < 36; attempt += 1) {
    target.position.set(
      THREE.MathUtils.randFloat(-4.45, 4.45),
      THREE.MathUtils.randFloat(-2.25, 2.3),
      THREE.MathUtils.randFloat(TARGET_Z_MIN, TARGET_Z_MAX),
    );
    found = pool.every((other) =>
      other === target || other.state !== "active" || target.position.distanceToSquared(other.position) > 1.62,
    );
    if (found) break;
  }
  if (!found) {
    const fallback = SAFE_POSITIONS[target.id % SAFE_POSITIONS.length];
    target.position.set(fallback[0], fallback[1], fallback[2]);
  }
  target.bornAt = performance.now();
  activateTarget(target);
}

export function ArenaArchitecture({ settings }: { settings: TrainingSettings }) {
  const materials = useMemo(() => ({
    shell: new THREE.MeshStandardMaterial({ color: "#15242c", emissive: "#0b151b", emissiveIntensity: 0.22, roughness: 0.82, metalness: 0.22 }),
    wall: new THREE.MeshStandardMaterial({ color: "#1f3039", emissive: "#0c171d", emissiveIntensity: 0.16, roughness: 0.74, metalness: 0.16 }),
    panel: new THREE.MeshStandardMaterial({ color: "#273a44", emissive: "#0d1c22", emissiveIntensity: 0.14, roughness: 0.67, metalness: 0.2 }),
    panelAlt: new THREE.MeshStandardMaterial({ color: "#22333c", emissive: "#0a171d", emissiveIntensity: 0.14, roughness: 0.79, metalness: 0.12 }),
    groove: new THREE.MeshBasicMaterial({ color: "#071015" }),
    trim: new THREE.MeshStandardMaterial({ color: "#5fb6c1", emissive: "#2a8f9b", emissiveIntensity: 0.55, roughness: 0.34, metalness: 0.56 }),
    light: new THREE.MeshBasicMaterial({ color: "#9debf2", toneMapped: false }),
  }), []);
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  useEffect(() => () => {
    box.dispose();
    Object.values(materials).forEach((material) => material.dispose());
  }, [box, materials]);

  return (
    <group dispose={null}>
      <mesh geometry={box} material={materials.wall} position={[0, 0.1, -6.68]} scale={[13.25, 7.65, 0.34]} />
      <mesh geometry={box} material={materials.shell} position={[0, 3.78, -6.35]} scale={[13.7, 0.34, 0.95]} />
      <mesh geometry={box} material={materials.shell} position={[0, -3.67, -6.28]} scale={[13.7, 0.38, 1.1]} />

      {PANEL_POSITIONS.map((panel, index) => (
        <mesh
          key={`panel-${panel.x}-${panel.y}`}
          geometry={box}
          material={index % 3 === 1 ? materials.panelAlt : materials.panel}
          position={[panel.x, panel.y, -6.46 - (index % 2) * 0.018]}
          scale={[2.36, 2.16, 0.09]}
        />
      ))}

      {[-3.72, -1.24, 1.24, 3.72].map((x) => (
        <mesh key={`seam-v-${x}`} geometry={box} material={materials.groove} position={[x, 0.1, -6.39]} scale={[0.032, 6.92, 0.035]} />
      ))}
      {[-1.08, 1.2].map((y) => (
        <mesh key={`seam-h-${y}`} geometry={box} material={materials.groove} position={[0, y, -6.39]} scale={[12.25, 0.032, 0.035]} />
      ))}
      <mesh geometry={box} material={materials.trim} position={[0, 3.43, -6.22]} scale={[9.6, 0.045, 0.045]} />
      <mesh geometry={box} material={materials.trim} position={[0, -3.21, -6.2]} scale={[9.6, 0.035, 0.035]} />

      <group position={[-7.05, -0.03, -3.15]} rotation={[0, -0.24, 0]}>
        <mesh geometry={box} material={materials.shell} scale={[0.34, 7.45, 7.3]} />
        <mesh geometry={box} material={materials.panelAlt} position={[0.2, 0.1, 0.1]} scale={[0.14, 6.45, 5.6]} />
        <mesh geometry={box} material={materials.trim} position={[0.3, 2.95, 0]} scale={[0.055, 0.055, 4.9]} />
      </group>
      <group position={[7.05, -0.03, -3.15]} rotation={[0, 0.24, 0]}>
        <mesh geometry={box} material={materials.shell} scale={[0.34, 7.45, 7.3]} />
        <mesh geometry={box} material={materials.panelAlt} position={[-0.2, 0.1, 0.1]} scale={[0.14, 6.45, 5.6]} />
        <mesh geometry={box} material={materials.trim} position={[-0.3, 2.95, 0]} scale={[0.055, 0.055, 4.9]} />
      </group>

      <mesh geometry={box} material={materials.shell} position={[0, 4.18, -2.8]} scale={[14.4, 0.3, 8.2]} />
      {CEILING_RIBS.map((z) => (
        <mesh key={`ceiling-${z}`} geometry={box} material={materials.panelAlt} position={[0, 4.0, z]} scale={[13.6, 0.12, 0.22]} />
      ))}
      <mesh geometry={box} material={materials.light} position={[-3.7, 3.97, -2.85]} scale={[3.6, 0.035, 0.12]} />
      <mesh geometry={box} material={materials.light} position={[3.7, 3.97, -2.85]} scale={[3.6, 0.035, 0.12]} />

      <mesh geometry={box} material={materials.shell} position={[0, -3.75, -2.55]} scale={[14.5, 0.28, 8.6]} />
      {settings.dynamicGridEnabled && (
        <Grid
          position={[0, -3.57, -2.45]}
          args={[13.5, 8.2]}
          cellSize={0.72}
          cellThickness={0.34}
          cellColor="#29404a"
          sectionSize={3.6}
          sectionThickness={0.5}
          sectionColor="#365b64"
          fadeDistance={9.5}
          fadeStrength={1.8}
          infiniteGrid={false}
        />
      )}

      <mesh geometry={box} material={materials.shell} position={[-8.5, 0.2, -10.5]} scale={[1.2, 6.6, 1.2]} />
      <mesh geometry={box} material={materials.shell} position={[8.5, 0.2, -10.5]} scale={[1.2, 6.6, 1.2]} />
      <mesh geometry={box} material={materials.light} position={[-8.1, 1.8, -9.8]} scale={[0.05, 2.2, 0.05]} />
      <mesh geometry={box} material={materials.light} position={[8.1, 1.8, -9.8]} scale={[0.05, 2.2, 0.05]} />
    </group>
  );
}

export const GridShotArenaScene = forwardRef<GridShotSceneApi, ArenaSceneProps>(function GridShotArenaScene(
  { state, settings, visualMode, debugInput, pointerInputMode, inputLifecycle, onShot },
  ref,
) {
  const { camera, gl } = useThree();
  const pool = useRef(makeScenePool());
  const refs = useRef<TargetRefs>({ root: [], body: [], core: [], contour: [], statusRing: [], spawnRing: [], collider: [], impact: [], particles: [] });
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointerNdc = useMemo(() => new THREE.Vector2(), []);
  const dragging = useRef(false);
  const stateRef = useRef(state);
  const inputRuntime = useRef({ settings, visualMode, debugInput, pointerInputMode, inputLifecycle, sensitivity: createNeonInputSensitivity(settings) });
  const finishAmount = useRef(0);
  const previousState = useRef<TrainingState>(state);
  const mainLight = useRef<THREE.DirectionalLight>(null);
  const rimLightLeft = useRef<THREE.PointLight>(null);
  const rimLightRight = useRef<THREE.PointLight>(null);
  stateRef.current = state;

  const sensitivity = createNeonInputSensitivity(settings);
  inputRuntime.current = { settings, visualMode, debugInput, pointerInputMode, inputLifecycle, sensitivity };
  const inputController = useMemo(() => new PointerLockInputController({
    getTrainingState: () => stateRef.current,
    shouldApplyInput: () => stateRef.current === "playing"
      && document.hasFocus()
      && document.visibilityState === "visible"
      && (inputRuntime.current.visualMode ? dragging.current : document.pointerLockElement === gl.domElement),
    getRadiansPerMouseCount: () => inputRuntime.current.sensitivity.radiansPerMouseCount,
    getHorizontalRatio: () => inputRuntime.current.sensitivity.horizontalRatio,
    getVerticalRatio: () => inputRuntime.current.sensitivity.verticalRatio,
    getInvertX: () => inputRuntime.current.settings.invertX,
    getInvertY: () => inputRuntime.current.settings.invertY,
    getSensitivity: () => inputRuntime.current.sensitivity.sensitivity,
    getCmPer360: () => inputRuntime.current.sensitivity.cmPer360,
    getInputMode: () => inputRuntime.current.pointerInputMode,
    onAnglesChanged: (yaw, pitch) => {
      camera.rotation.order = "YXZ";
      camera.rotation.set(pitch, yaw, 0);
    },
    onPointerLockChanged: (locked) => inputRuntime.current.inputLifecycle.onPointerLockChanged(locked),
    onFullscreenChanged: (fullscreen) => inputRuntime.current.inputLifecycle.onFullscreenChanged(fullscreen),
    onFocusChanged: (focused) => inputRuntime.current.inputLifecycle.onFocusChanged(focused),
    onVisibilityChanged: (visible) => inputRuntime.current.inputLifecycle.onVisibilityChanged(visible),
    debugEnabled: inputRuntime.current.debugInput,
  }, {
    windowTarget: window,
    documentTarget: document,
    now: () => performance.now(),
    pointerLocked: () => document.pointerLockElement === gl.domElement,
    fullscreen: () => Boolean(document.fullscreenElement),
    windowFocused: () => document.hasFocus(),
    documentVisible: () => document.visibilityState === "visible",
  }), [camera, gl]);
  const targetGeometries = useMemo(() => ({
    collider: new THREE.SphereGeometry(0.5 * settings.targetSize, 20, 14),
    body: new THREE.CylinderGeometry(0.49 * settings.targetSize, 0.49 * settings.targetSize, 0.14, 40, 1),
    core: new THREE.CylinderGeometry(0.115 * settings.targetSize, 0.115 * settings.targetSize, 0.158, 32, 1),
    contour: new THREE.TorusGeometry(0.455 * settings.targetSize, 0.018, 8, 40),
    status: new THREE.TorusGeometry(0.55 * settings.targetSize, 0.01, 6, 40),
    impact: new THREE.TorusGeometry(0.5 * settings.targetSize, 0.025, 8, 40),
    particle: new THREE.SphereGeometry(0.036, 8, 6),
    marker: new THREE.BoxGeometry(0.115 * settings.targetSize, 0.022 * settings.targetSize, 0.018),
  }), [settings.targetSize]);
  const targetMaterials = useMemo(() => pool.current.map(() => ({
    body: new THREE.MeshStandardMaterial({ color: settings.targetColor, emissive: "#4d9fa9", emissiveIntensity: 0.2, roughness: 0.56, metalness: 0.3, transparent: true }),
    core: new THREE.MeshStandardMaterial({ color: "#f4ffff", emissive: "#aaf9ff", emissiveIntensity: 0.8, roughness: 0.24, metalness: 0.18, transparent: true }),
    spawn: new THREE.MeshBasicMaterial({ color: "#87f4ff", transparent: true, opacity: 0.34, depthWrite: false, toneMapped: false }),
    impact: new THREE.MeshBasicMaterial({ color: "#58d8e2", transparent: true, opacity: 0.78, depthWrite: false, toneMapped: false }),
    particle: new THREE.MeshBasicMaterial({ color: "#70dce5", transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false }),
  })), [settings.targetColor]);
  const sharedMaterials = useMemo(() => ({
    contour: new THREE.MeshBasicMaterial({ color: "#e9ffff", transparent: true, opacity: 0.68, toneMapped: false }),
    status: new THREE.MeshBasicMaterial({ color: "#65dce7", transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false }),
    collider: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    marker: new THREE.MeshBasicMaterial({ color: "#46737b", transparent: true, opacity: 0.72, toneMapped: false }),
  }), []);

  useEffect(() => () => {
    Object.values(targetGeometries).forEach((geometry) => geometry.dispose());
    targetMaterials.forEach((materials) => Object.values(materials).forEach((material) => material.dispose()));
    Object.values(sharedMaterials).forEach((material) => material.dispose());
  }, [sharedMaterials, targetGeometries, targetMaterials]);

  const resetPool = useCallback(() => {
    initializeThreeTargets(pool.current);
    pool.current.slice(0, ACTIVE_TARGET_COUNT).forEach((target) => placeTarget(target, pool.current));
  }, []);

  const hitTarget = useCallback((target: SceneTarget, forcedInterval?: number) => {
    const replacement = pool.current.find((candidate) => candidate.state === "inactive");
    if (!hitAndReplace(pool.current, target)) return false;
    target.hitAt = performance.now();
    if (replacement) placeTarget(replacement, pool.current);
    const outcome = onShot(true, Math.max(0, target.hitAt - target.bornAt), forcedInterval, {
      timestamp: target.hitAt,
      targetId: target.id,
      targetActivatedAt: target.bornAt,
    });
    target.hitAccent = outcome?.fast ? "fast" : "normal";
    return true;
  }, [onShot]);

  useImperativeHandle(ref, () => ({
    simulateHit: (forcedInterval?: number) => {
      const target = pool.current.find((candidate) => candidate.state === "active");
      return target ? hitTarget(target, forcedInterval) : false;
    },
    getDiagnostics: () => {
      const counts = getTargetCounts(pool.current);
      if (stateRef.current === "finishing" || stateRef.current === "finished") {
        counts.activeColliders = 0;
        counts.visuallyClickableTargets = 0;
      }
      return {
        counts,
        targets: pool.current.map((target) => ({ ...target, rootVisible: Boolean(refs.current.root[target.id]?.visible) })),
      };
    },
    getInputDebugSnapshot: () => inputController.getDebugSnapshot(),
  }), [hitTarget, inputController]);

  useEffect(() => {
    const prior = previousState.current;
    if (state === "ready" || state === "countdown" || (state === "playing" && (prior === "ready" || prior === "countdown"))) {
      resetPool();
    }
    if (state !== "finishing") finishAmount.current = 0;
    previousState.current = state;
  }, [resetPool, state]);

  useEffect(() => {
    inputController.setAngles(camera.rotation.y, camera.rotation.x);
    inputController.attach();
    return () => inputController.detach();
  }, [camera, inputController]);

  useEffect(() => {
    if (state !== "playing") inputController.clearTransientInput();
  }, [inputController, state]);

  useEffect(() => {
    const down = (event: MouseEvent) => {
      if (visualMode && event.button === 2) {
        if (event.target === gl.domElement) dragging.current = true;
        return;
      }
      if (visualMode && event.target !== gl.domElement) return;
      if (event.button !== 0 || stateRef.current !== "playing" || (!visualMode && document.pointerLockElement !== gl.domElement)) return;
      event.preventDefault();
      inputController.markShot(performance.now());
      if (visualMode) {
        const rect = gl.domElement.getBoundingClientRect();
        pointerNdc.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointerNdc, camera);
      } else {
        raycaster.setFromCamera(CENTER_RAY, camera);
      }
      const objects: THREE.Mesh[] = [];
      for (const target of pool.current) {
        const collider = refs.current.collider[target.poolIndex];
        if (target.state === "active" && target.colliderRegistered && collider?.visible) objects.push(collider);
      }
      const intersection = raycaster.intersectObjects(objects, false)[0];
      if (!intersection) {
        onShot(false, 0);
        return;
      }
      const target = pool.current[Number(intersection.object.userData.poolIndex)];
      if (!target || !hitTarget(target)) onShot(false, 0);
    };
    const up = (event: MouseEvent) => {
      if (event.button === 2) dragging.current = false;
    };
    const keys = (event: KeyboardEvent) => {
      if (!visualMode || stateRef.current !== "playing") return;
      const step = event.shiftKey ? 36 : 16;
      const angles = inputController.getAngles();
      if (["ArrowLeft", "a", "j"].includes(event.key)) inputController.setAngles(angles.yaw + step * sensitivity.radiansPerMouseCount, angles.pitch);
      if (["ArrowRight", "d", "l"].includes(event.key)) inputController.setAngles(angles.yaw - step * sensitivity.radiansPerMouseCount, angles.pitch);
      if (["ArrowUp", "w", "i"].includes(event.key)) inputController.setAngles(angles.yaw, angles.pitch + step * sensitivity.radiansPerMouseCount);
      if (["ArrowDown", "s", "k"].includes(event.key)) inputController.setAngles(angles.yaw, angles.pitch - step * sensitivity.radiansPerMouseCount);
    };
    const context = (event: MouseEvent) => {
      if (visualMode) event.preventDefault();
    };
    window.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);
    window.addEventListener("keydown", keys);
    gl.domElement.addEventListener("contextmenu", context);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", keys);
      gl.domElement.removeEventListener("contextmenu", context);
    };
  }, [camera, gl, hitTarget, inputController, onShot, pointerNdc, raycaster, sensitivity.radiansPerMouseCount, visualMode]);

  useFrame((_, delta) => {
    if (stateRef.current === "finishing") finishAmount.current = Math.min(1, finishAmount.current + delta / 0.62);
    const targetsVisible = stateRef.current === "playing" || stateRef.current === "paused" || stateRef.current === "finishing";
    const exitScale = 1 - finishAmount.current;

    for (const target of pool.current) {
      advanceTargetVisual(target, delta * 1000);
      const root = refs.current.root[target.id];
      const body = refs.current.body[target.id];
      const core = refs.current.core[target.id];
      const contour = refs.current.contour[target.id];
      const statusRing = refs.current.statusRing[target.id];
      const spawnRing = refs.current.spawnRing[target.id];
      const collider = refs.current.collider[target.id];
      const impact = refs.current.impact[target.id];
      const particles = refs.current.particles[target.id];
      if (!root || !body || !core || !contour || !statusRing || !spawnRing || !collider || !impact || !particles) continue;

      const isActive = target.state === "active";
      const isHit = target.state === "hit" || target.state === "despawning";
      root.visible = targetsVisible && target.bodyVisible && exitScale > 0.01;
      root.position.copy(target.position);
      if (isHit) {
        const collapse = Math.max(0, 1 - target.hitProgress);
        root.scale.set(target.bodyScale * exitScale, target.bodyScale * exitScale, Math.max(0.12, collapse * 0.34));
      } else {
        root.scale.setScalar(target.bodyScale * exitScale);
      }

      const bodyMaterial = body.material as THREE.MeshStandardMaterial;
      const coreMaterial = core.material as THREE.MeshStandardMaterial;
      bodyMaterial.opacity = isHit ? Math.max(0, 1 - target.hitProgress * 1.15) : target.bodyOpacity;
      bodyMaterial.emissiveIntensity = isHit ? 2.3 * (1 - target.hitProgress) : 0.2;
      coreMaterial.opacity = isHit ? Math.max(0, 1 - target.hitProgress) : target.bodyOpacity;
      coreMaterial.emissiveIntensity = isHit ? 3.4 * (1 - target.hitProgress) : 0.45 + target.spawnProgress * 0.5;

      contour.visible = isActive && target.spawnProgress > 0.1;
      statusRing.visible = isActive && target.ringVisible && target.spawnProgress > 0.48;
      statusRing.scale.setScalar(0.9 + target.spawnProgress * 0.1);
      spawnRing.visible = isActive && target.spawnProgress < 0.92;
      spawnRing.scale.setScalar(0.68 + target.spawnProgress * 0.78);
      (spawnRing.material as THREE.MeshBasicMaterial).opacity = 0.38 * (1 - target.spawnProgress);
      collider.visible = targetsVisible && target.colliderVisible && target.colliderRegistered;

      impact.visible = isHit;
      impact.scale.setScalar(0.82 + target.hitProgress * 2.05);
      (impact.material as THREE.MeshBasicMaterial).color.set(target.hitAccent === "fast" ? "#e6b866" : "#58d8e2");
      (impact.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.78 - target.hitProgress);
      particles.visible = isHit && target.hitProgress < 0.92;
      particles.scale.setScalar(0.3 + target.hitProgress * 2.4);
      particles.rotation.z = target.hitProgress * 0.32;
      (targetMaterials[target.id].particle as THREE.MeshBasicMaterial).color.set(target.hitAccent === "fast" ? "#e7bf75" : "#70dce5");
    }

    const lightFade = 1 - finishAmount.current * 0.62;
    if (mainLight.current) mainLight.current.intensity = 1.45 * lightFade;
    if (rimLightLeft.current) rimLightLeft.current.intensity = 5.2 * lightFade;
    if (rimLightRight.current) rimLightRight.current.intensity = 5.2 * lightFade;

    if (import.meta.env.DEV && (stateRef.current === "countdown" || stateRef.current === "playing" || stateRef.current === "paused")) {
      assertGridShotTargetInvariants(pool.current);
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault fov={settings.fov} position={[0, 0.2, 1.2]} near={0.05} far={48} />
      <color attach="background" args={["#081119"]} />
      {settings.fogEnabled && <fog attach="fog" args={["#081119", 10, 27]} />}

      <ambientLight intensity={settings.lowSpec ? 0.34 : 0.42} color="#b8cad2" />
      <hemisphereLight args={["#7f9eaa", "#10151a", settings.lowSpec ? 0.45 : 0.62]} />
      <directionalLight ref={mainLight} position={[0, 5.5, 2.8]} color="#d9f8ff" intensity={1.45} />
      <pointLight position={[0, 1.2, -4.7]} color="#bceff3" intensity={4.2} distance={9} decay={2} />
      <pointLight ref={rimLightLeft} position={[-6.2, 2.2, -2.2]} color="#3bb7c8" intensity={5.2} distance={8} decay={2} />
      <pointLight ref={rimLightRight} position={[6.2, 2.2, -2.2]} color="#3bb7c8" intensity={5.2} distance={8} decay={2} />

      <ArenaArchitecture settings={settings} />

      {pool.current.map((target) => (
        <group
          key={target.id}
          ref={(value) => { refs.current.root[target.id] = value; }}
          visible={false}
          dispose={null}
        >
          <mesh
            ref={(value) => { refs.current.collider[target.id] = value; }}
            geometry={targetGeometries.collider}
            material={sharedMaterials.collider}
            userData={{ poolIndex: target.poolIndex }}
          />
          <mesh
            ref={(value) => { refs.current.body[target.id] = value; }}
            geometry={targetGeometries.body}
            material={targetMaterials[target.id].body}
            rotation={[Math.PI / 2, 0, 0]}
            raycast={() => undefined}
          />
          <mesh
            ref={(value) => { refs.current.core[target.id] = value; }}
            geometry={targetGeometries.core}
            material={targetMaterials[target.id].core}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0, 0.012]}
            raycast={() => undefined}
          />
          {[0, 1, 2, 3].map((index) => (
            <mesh
              key={`marker-${index}`}
              geometry={targetGeometries.marker}
              material={sharedMaterials.marker}
              position={[
                Math.cos(index * Math.PI / 2) * 0.31 * settings.targetSize,
                Math.sin(index * Math.PI / 2) * 0.31 * settings.targetSize,
                0.086,
              ]}
              rotation={[0, 0, index * Math.PI / 2]}
              raycast={() => undefined}
            />
          ))}
          <mesh
            ref={(value) => { refs.current.contour[target.id] = value; }}
            geometry={targetGeometries.contour}
            material={sharedMaterials.contour}
            position={[0, 0, 0.085]}
            raycast={() => undefined}
          />
          <mesh
            ref={(value) => { refs.current.statusRing[target.id] = value; }}
            geometry={targetGeometries.status}
            material={sharedMaterials.status}
            position={[0, 0, 0.07]}
            raycast={() => undefined}
          />
          <mesh
            ref={(value) => { refs.current.spawnRing[target.id] = value; }}
            geometry={targetGeometries.status}
            material={targetMaterials[target.id].spawn}
            position={[0, 0, 0.075]}
            raycast={() => undefined}
          />
          <mesh
            ref={(value) => { refs.current.impact[target.id] = value; }}
            geometry={targetGeometries.impact}
            material={targetMaterials[target.id].impact}
            position={[0, 0, 0.1]}
            visible={false}
            raycast={() => undefined}
          />
          <group ref={(value) => { refs.current.particles[target.id] = value; }} visible={false}>
            {PARTICLE_DIRECTIONS.slice(0, settings.particleQuality === "low" ? 4 : settings.particleQuality === "off" ? 0 : 8).map((direction, index) => (
              <mesh
                key={`particle-${index}`}
                geometry={targetGeometries.particle}
                material={targetMaterials[target.id].particle}
                position={[direction[0] * 0.5, direction[1] * 0.5, 0.12 + (index % 2) * 0.025]}
                rotation={[0, 0, index * 0.76]}
                raycast={() => undefined}
              />
            ))}
          </group>
        </group>
      ))}
    </>
  );
});
