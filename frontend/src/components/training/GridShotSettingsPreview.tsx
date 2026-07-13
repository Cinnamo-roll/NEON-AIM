import { PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  DEFAULT_GRID_SHOT_SETTINGS,
  getGridShotScene,
  getGridShotTargetSize,
  gridShotParticleCount,
  type GridShotModeSettings,
} from "../../game/modes/gridShot/gridShotConfig";
import { DEFAULT_TRAINING_SETTINGS } from "../../game/settings/trainingSettings";
import { GRID_SHOT_HIT_EFFECT_DURATION_MS } from "../../game/targets/gridShotTargetModel";
import type { TrainingSettings } from "../../game/types/training";
import { ArenaArchitecture } from "./GridShotArenaScene";
import { getGridShotImpactVisual, getGridShotParticleTransform, GRID_SHOT_PARTICLE_DIRECTIONS, GRID_SHOT_SAFE_POSITIONS } from "./gridShotSceneLayout";

function PreviewTarget({
  position,
  scale,
  scene,
  modeSettings,
  impactTick,
}: {
  position: readonly [number, number, number];
  scale: number;
  scene: ReturnType<typeof getGridShotScene>;
  modeSettings: GridShotModeSettings;
  impactTick?: number;
}) {
  const face = useRef<THREE.Group>(null);
  const bodyMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const coreMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const impactCore = useRef<THREE.Mesh>(null);
  const impact = useRef<THREE.Mesh>(null);
  const impactHalo = useRef<THREE.Mesh>(null);
  const particles = useRef<THREE.Group>(null);
  const startedAt = useRef(Number.NEGATIVE_INFINITY);
  const invalidate = useThree((state) => state.invalidate);
  const particleCount = gridShotParticleCount(modeSettings.hitEffectStyle);

  useEffect(() => {
    if (impactTick === undefined) return;
    startedAt.current = performance.now();
    invalidate();
  }, [impactTick, invalidate]);

  useFrame(() => {
    if (!face.current || !bodyMaterial.current || !coreMaterial.current || !impactCore.current || !impact.current || !impactHalo.current || !particles.current) return;
    const hitProgress = Math.min(1, Math.max(0, (performance.now() - startedAt.current) / GRID_SHOT_HIT_EFFECT_DURATION_MS));
    const active = hitProgress < 1;
    const impactVisual = getGridShotImpactVisual(modeSettings.hitEffectStyle, hitProgress);
    const impactColor = scene.target.normalImpact;

    if (active) {
      face.current.scale.set(...impactVisual.targetScale);
      bodyMaterial.current.opacity = impactVisual.bodyOpacity;
      coreMaterial.current.opacity = impactVisual.coreOpacity;
    } else {
      face.current.scale.setScalar(1);
      bodyMaterial.current.opacity = 1;
      coreMaterial.current.opacity = 1;
    }

    impactCore.current.visible = active && impactVisual.flashVisible;
    impactCore.current.scale.setScalar(impactVisual.flashScale);
    const impactCoreMaterial = impactCore.current.material as THREE.MeshBasicMaterial;
    impactCoreMaterial.color.set(impactColor);
    impactCoreMaterial.opacity = impactVisual.flashOpacity;

    impact.current.visible = active && impactVisual.ringVisible;
    impact.current.scale.setScalar(impactVisual.ringScale);
    const impactMaterial = impact.current.material as THREE.MeshBasicMaterial;
    impactMaterial.color.set(impactColor);
    impactMaterial.opacity = impactVisual.ringOpacity;

    impactHalo.current.visible = false;
    const haloMaterial = impactHalo.current.material as THREE.MeshBasicMaterial;
    haloMaterial.color.set(impactColor);
    haloMaterial.opacity = 0;

    particles.current.visible = active && particleCount > 0 && impactVisual.particlesVisible;
    particles.current.rotation.z = 0;
    particles.current.children.forEach((child, index) => {
      const particle = child as THREE.Mesh;
      const transform = getGridShotParticleTransform(modeSettings.hitEffectStyle, index, hitProgress);
      if (!transform || index >= particleCount) {
        particle.visible = false;
        return;
      }
      particle.position.set(transform.x, transform.y, 0.13 + (index % 3) * 0.012);
      particle.rotation.z = transform.rotation;
      particle.scale.set(transform.scaleX, transform.scaleY, 1);
      particle.visible = transform.visible;
      const particleMaterial = particle.material as THREE.MeshBasicMaterial;
      particleMaterial.color.set(impactColor);
      particleMaterial.opacity = impactVisual.particleOpacity;
    });

    if (active) invalidate();
  });

  return (
    <group position={position} scale={scale}>
      <group ref={face}>
        <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => undefined}>
          <cylinderGeometry args={[0.49, 0.49, 0.14, 40, 1]} />
          <meshStandardMaterial ref={bodyMaterial} color={scene.target.color} emissive={scene.target.emissive} emissiveIntensity={0.2} roughness={0.56} metalness={0.3} transparent />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.012]} raycast={() => undefined}>
          <cylinderGeometry args={[0.115, 0.115, 0.158, 32, 1]} />
          <meshStandardMaterial ref={coreMaterial} color="#f4ffff" emissive="#aaf9ff" emissiveIntensity={0.8} roughness={0.24} metalness={0.18} transparent />
        </mesh>
        {[0, 1, 2, 3].map((index) => (
          <mesh key={index} position={[Math.cos(index * Math.PI / 2) * 0.31, Math.sin(index * Math.PI / 2) * 0.31, 0.086]} rotation={[0, 0, index * Math.PI / 2]} raycast={() => undefined}>
            <boxGeometry args={[0.115, 0.022, 0.018]} />
            <meshBasicMaterial color="#46737b" transparent opacity={0.72} toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.085]} raycast={() => undefined}>
          <torusGeometry args={[0.455, 0.018, 8, 40]} />
          <meshBasicMaterial color="#e9ffff" transparent opacity={0.68} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, 0.07]} raycast={() => undefined}>
          <torusGeometry args={[0.55, 0.01, 6, 40]} />
          <meshBasicMaterial color="#65dce7" transparent opacity={0.12} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={impactCore} position={[0, 0, 0.092]} visible={false} raycast={() => undefined}>
        <circleGeometry args={[0.48, 40]} />
        <meshBasicMaterial transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={impact} position={[0, 0, 0.1]} visible={false} raycast={() => undefined}>
        <torusGeometry args={[0.5, 0.025, 8, 40]} />
        <meshBasicMaterial transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={impactHalo} position={[0, 0, 0.095]} visible={false} raycast={() => undefined}>
        <torusGeometry args={[0.58, 0.012, 6, 48]} />
        <meshBasicMaterial transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <group ref={particles} visible={false}>
        {GRID_SHOT_PARTICLE_DIRECTIONS.map((direction, index) => (
          <mesh key={index} position={[direction[0] * 0.24, direction[1] * 0.24, 0.13 + (index % 3) * 0.012]} rotation={[0, 0, Math.atan2(direction[1], direction[0]) - Math.PI / 2]} raycast={() => undefined}>
            {modeSettings.hitEffectStyle === "shards"
              ? <tetrahedronGeometry args={[0.072, 0]} />
              : modeSettings.hitEffectStyle === "spiral"
                ? <sphereGeometry args={[0.04, 8, 6]} />
                : <boxGeometry args={[0.028, 0.17, 0.018]} />}
            <meshBasicMaterial color={scene.target.normalImpact} transparent opacity={0.72} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function GridShotSettingsPreview({
  settings = DEFAULT_TRAINING_SETTINGS,
  modeSettings = DEFAULT_GRID_SHOT_SETTINGS,
  focusTarget = false,
  impactTick,
}: {
  settings?: TrainingSettings;
  modeSettings?: GridShotModeSettings;
  focusTarget?: boolean;
  impactTick?: number;
}) {
  const scene = getGridShotScene(modeSettings.sceneId);
  const targetScale = getGridShotTargetSize(modeSettings.targetSize).scale;
  const dpr = Math.min((settings.dprMode === "auto" ? window.devicePixelRatio : settings.dprMode) * settings.renderScale, 2);

  return (
    <Canvas
      key={`${settings.antialiasEnabled ? "preview-aa" : "preview-no-aa"}-${scene.id}`}
      className="grid-shot-preview-canvas"
      dpr={dpr}
      frameloop="demand"
      gl={{ antialias: settings.antialiasEnabled, alpha: false, powerPreference: "high-performance" }}
    >
      <PerspectiveCamera makeDefault fov={scene.camera.fov} position={scene.camera.position} near={0.05} far={48} />
      <color attach="background" args={[scene.environment.background]} />
      <fog attach="fog" args={[scene.environment.fog, scene.environment.fogNear, scene.environment.fogFar]} />

      <ambientLight intensity={settings.lowSpec ? 0.34 : 0.42} color="#b8cad2" />
      <hemisphereLight args={["#7f9eaa", "#10151a", settings.lowSpec ? 0.45 : 0.62]} />
      <directionalLight position={[0, 5.5, 2.8]} color="#d9f8ff" intensity={1.45} />
      <pointLight position={[0, 1.2, -4.7]} color="#bceff3" intensity={4.2} distance={9} decay={2} />
      {!settings.lowSpec && <>
        <pointLight position={[-6.2, 2.2, -2.2]} color="#3bb7c8" intensity={5.2} distance={8} decay={2} />
        <pointLight position={[6.2, 2.2, -2.2]} color="#3bb7c8" intensity={5.2} distance={8} decay={2} />
      </>}

      <ArenaArchitecture dynamicGrid={scene.environment.dynamicGrid} />
      {GRID_SHOT_SAFE_POSITIONS.slice(0, 3).map((position, index) => (
        <PreviewTarget
          key={index}
          position={position}
          scale={targetScale}
          scene={scene}
          modeSettings={modeSettings}
          impactTick={focusTarget && index === 1 ? impactTick : undefined}
        />
      ))}
    </Canvas>
  );
}
