import { PerspectiveCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { TrainingSettings } from "../../game/types/training";
import { ArenaArchitecture } from "./GridShotArenaScene";

const PREVIEW_TARGETS = [
  [-3.3, 1.2, -5.85],
  [0.1, -0.4, -5.8],
  [3.25, 1.35, -5.9],
] as const;

function PreviewTarget({ position, settings }: { position: readonly [number, number, number]; settings: TrainingSettings }) {
  return (
    <group position={position} scale={settings.targetSize}>
      <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => undefined}>
        <cylinderGeometry args={[0.49, 0.49, 0.14, 40, 1]} />
        <meshStandardMaterial color={settings.targetColor} emissive="#4d9fa9" emissiveIntensity={0.2} roughness={0.56} metalness={0.3} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.012]} raycast={() => undefined}>
        <cylinderGeometry args={[0.115, 0.115, 0.158, 32, 1]} />
        <meshStandardMaterial color="#f4ffff" emissive="#aaf9ff" emissiveIntensity={0.8} roughness={0.24} metalness={0.18} />
      </mesh>
      <mesh position={[0, 0, 0.085]} raycast={() => undefined}>
        <torusGeometry args={[0.455, 0.018, 8, 40]} />
        <meshBasicMaterial color="#e9ffff" transparent opacity={0.68} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.07]} raycast={() => undefined}>
        <torusGeometry args={[0.55, 0.01, 6, 40]} />
        <meshBasicMaterial color="#65dce7" transparent opacity={0.12} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function GridShotSettingsPreview({ settings }: { settings: TrainingSettings }) {
  const dpr = Math.min((settings.dprMode === "auto" ? window.devicePixelRatio : settings.dprMode) * settings.renderScale, 2);

  return (
    <Canvas
      key={settings.antialiasEnabled ? "preview-aa" : "preview-no-aa"}
      className="grid-shot-preview-canvas"
      dpr={dpr}
      frameloop="demand"
      gl={{ antialias: settings.antialiasEnabled, alpha: false, powerPreference: "high-performance" }}
    >
      <PerspectiveCamera makeDefault fov={settings.fov} position={[0, 0.2, 1.2]} near={0.05} far={48} />
      <color attach="background" args={["#081119"]} />
      {settings.fogEnabled && <fog attach="fog" args={["#081119", 10, 27]} />}

      <ambientLight intensity={settings.lowSpec ? 0.34 : 0.42} color="#b8cad2" />
      <hemisphereLight args={["#7f9eaa", "#10151a", settings.lowSpec ? 0.45 : 0.62]} />
      <directionalLight position={[0, 5.5, 2.8]} color="#d9f8ff" intensity={1.45} />
      <pointLight position={[0, 1.2, -4.7]} color="#bceff3" intensity={4.2} distance={9} decay={2} />
      {!settings.lowSpec && <>
        <pointLight position={[-6.2, 2.2, -2.2]} color="#3bb7c8" intensity={5.2} distance={8} decay={2} />
        <pointLight position={[6.2, 2.2, -2.2]} color="#3bb7c8" intensity={5.2} distance={8} decay={2} />
      </>}

      <ArenaArchitecture settings={settings} />
      {PREVIEW_TARGETS.map((position, index) => <PreviewTarget key={index} position={position} settings={settings} />)}
    </Canvas>
  );
}
