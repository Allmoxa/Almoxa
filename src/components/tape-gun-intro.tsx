import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { gsap } from "gsap";

const SESSION_KEY = "almoxa-tape-intro-played";
const MODEL_URL = "/models/almoxa-tape-gun.glb";

const NODE_NAMES = [
  "TapeRoll",
  "RollCore",
  "TapeStrip",
  "Handle",
  "PressureRoller",
  "Cutter",
  "FrameUpper",
  "FrameLower",
] as const;

type NodeName = (typeof NODE_NAMES)[number];
type TapeNodes = Partial<Record<NodeName, THREE.Object3D>>;

const DURATION = 3.6;
const HOLD = 1;
const FADE = 0.8;
const SPIN_SPEED = 46; // rad por unidade de progresso — mais rápido quando o aplicador acelera

/**
 * Caminho 2D em coordenadas de tela: entra fora da tela no canto superior
 * direito, mergulha na área da caixa (StepsCube), reaparece do lado
 * esquerdo dela, desce pelo vão entre a coluna de texto e a caixa sem
 * cruzar nem texto nem botão, sai fora da tela no canto inferior esquerdo.
 * Medido pela posição real dos elementos na tela, não é uma diagonal fixa.
 */
function buildPath(heroRect: DOMRect, boxRect: DOMRect, vw: number, vh: number, narrow: boolean) {
  // No celular os cantos "fora da tela" ficam bem mais perto — senão a
  // margem fixa vira quase metade da largura da tela e a fita demora uma
  // eternidade só pra entrar em cena.
  const m = narrow ? 0.45 : 1;
  const p0 = { x: vw + 160 * m, y: -160 * m };
  const p1 = { x: boxRect.right + 50 * m, y: boxRect.top - 100 * m };
  const p2 = { x: (boxRect.left + boxRect.right) / 2, y: (boxRect.top + boxRect.bottom) / 2 };
  const p3 = { x: boxRect.left - 70 * m, y: boxRect.bottom - 20 };
  const gapX = Math.max(heroRect.right + 60 * m, boxRect.left - 110 * m);
  const belowY = Math.max(heroRect.bottom, boxRect.bottom) + 80 * m;
  const p4 = { x: gapX, y: belowY };
  const p5 = { x: heroRect.left - 100 * m, y: vh * 0.94 };
  const p6 = { x: -180 * m, y: vh + 180 * m };

  return (
    `M ${p0.x} ${p0.y} ` +
    `C ${p0.x - 130} ${p0.y + 90}, ${p1.x + 90} ${p1.y - 70}, ${p1.x} ${p1.y} ` +
    `S ${p2.x} ${p2.y}, ${p3.x} ${p3.y} ` +
    `C ${p3.x - 70} ${p3.y + 70}, ${p4.x + 50} ${p4.y - 70}, ${p4.x} ${p4.y} ` +
    `C ${p4.x - 70} ${p4.y + 90}, ${p5.x + 90} ${p5.y - 100}, ${p5.x} ${p5.y} ` +
    `S ${p6.x} ${p6.y}, ${p6.x} ${p6.y}`
  );
}

type RigProps = {
  pathRef: React.RefObject<SVGPathElement | null>;
  vw: number;
  vh: number;
  narrow: boolean;
  playingRef: React.RefObject<boolean>;
  progressRef: React.RefObject<number>;
  onReady: () => void;
};

/**
 * O Canvas do R3F normalmente detecta o tamanho do contêiner sozinho via
 * ResizeObserver. Como garantia (o contêiner já nasce do tamanho certo,
 * fixed inset-0), força explicitamente pro tamanho de tela conhecido em vez
 * de depender só da detecção automática.
 */
function ForceCanvasSize({ vw, vh }: { vw: number; vh: number }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const setSize = useThree((s) => s.setSize);

  useEffect(() => {
    setSize(vw, vh);
    camera.left = vw / -2;
    camera.right = vw / 2;
    camera.top = vh / 2;
    camera.bottom = vh / -2;
    camera.updateProjectionMatrix();
    gl.setSize(vw, vh);
  }, [vw, vh, gl, camera, setSize]);

  return null;
}

function Rig({ pathRef, vw, vh, narrow, playingRef, progressRef, onReady }: RigProps) {
  const { scene } = useGLTF(MODEL_URL);
  const nodesRef = useRef<TapeNodes>({});
  const readyRef = useRef(false);
  const spinRef = useRef(0);
  const lastProgressRef = useRef(0);

  useEffect(() => {
    if (readyRef.current) return;
    readyRef.current = true;

    const found: TapeNodes = {};
    for (const name of NODE_NAMES) {
      const obj = scene.getObjectByName(name);
      if (obj) found[name] = obj;
    }
    nodesRef.current = found;

    // Centraliza a geometria no próprio pivô do grupo (desloca cada filho
    // direto, não a `scene` em si) — assim girar/escalar/posicionar `scene`
    // depois gira em torno do centro visual de verdade, em vez de orbitar um
    // canto qualquer da malha. Todos os 15 nós do GLB são filhos diretos.
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    for (const child of [...scene.children]) child.position.sub(center);

    const targetPx = narrow ? 130 : 210;
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    scene.scale.setScalar(targetPx / maxDim);

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!(mesh as THREE.Mesh).isMesh) return;
      mesh.castShadow = true;
      const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (mat && mat.name === "AmberPackingTape") {
        mat.transparent = true;
        mat.opacity = 0.62;
        mat.roughness = 0.16;
        mat.depthWrite = false;
      }
    });

    // Início da fita presa ao ponto de partida do trajeto: escala em X quase
    // zero, cresce conforme o aplicador avança (feito no useFrame abaixo).
    if (nodesRef.current.TapeStrip) nodesRef.current.TapeStrip.scale.x = 0.001;

    onReady();
  }, [scene, narrow, onReady]);

  useFrame((_state, delta) => {
    if (!playingRef.current) return;
    const path = pathRef.current;
    if (!path) return;

    const t = progressRef.current;
    const length = path.getTotalLength();
    const at = Math.min(t * length, length);
    const eps = Math.max(length * 0.004, 2);
    const p = path.getPointAtLength(at);
    const ahead = path.getPointAtLength(Math.min(at + eps, length));

    const toThree = (px: number, py: number) => ({
      x: (px - vw / 2) / scene.scale.x,
      y: (vh / 2 - py) / scene.scale.x,
    });
    const cur = toThree(p.x, p.y);
    const nxt = toThree(ahead.x, ahead.y);
    const angle = Math.atan2(nxt.y - cur.y, nxt.x - cur.x);
    const wobble = Math.sin(t * 24) * 0.045;

    scene.position.x = cur.x;
    scene.position.y = cur.y;
    scene.rotation.z = angle + wobble;

    // Velocidade do giro do rolo acompanha a velocidade real do trajeto —
    // acelera e desacelera junto com o aplicador, não é constante.
    const dProgress = Math.max(t - lastProgressRef.current, 0);
    lastProgressRef.current = t;
    spinRef.current += dProgress * SPIN_SPEED + delta * 0.6;
    const roll = nodesRef.current.TapeRoll;
    const core = nodesRef.current.RollCore;
    if (roll) roll.rotation.y = spinRef.current;
    if (core) core.rotation.y = spinRef.current;

    const strip = nodesRef.current.TapeStrip;
    if (strip) strip.scale.x = Math.max(t, 0.001);
  });

  return <primitive object={scene} />;
}

export function TapeGunIntro() {
  const containerRef = useRef<HTMLDivElement>(null);
  const geometryPathRef = useRef<SVGPathElement>(null);
  const playingRef = useRef(false);
  const progressRef = useRef(0);
  const [play, setPlay] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [dims] = useState(() => ({
    vw: typeof window !== "undefined" ? window.innerWidth : 1280,
    vh: typeof window !== "undefined" ? window.innerHeight : 800,
  }));
  const narrow = dims.vw < 640;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, "1");
    setPlay(true);
  }, []);

  // Monta o caminho assim que os elementos do hero existem na tela.
  useEffect(() => {
    if (!play) return;
    const path = geometryPathRef.current;
    const heroEl = document.querySelector<HTMLElement>('[data-tape-hero="true"]');
    const boxEl = document.querySelector<HTMLElement>('[data-tape-box="true"]');
    if (!path || !heroEl || !boxEl) return;
    path.setAttribute(
      "d",
      buildPath(
        heroEl.getBoundingClientRect(),
        boxEl.getBoundingClientRect(),
        dims.vw,
        dims.vh,
        narrow,
      ),
    );
  }, [play, dims, narrow]);

  // Só liga o timeline depois que o modelo carregou e o caminho existe.
  useEffect(() => {
    if (!play || !modelReady) return;
    const container = containerRef.current;
    if (!container) return;

    gsap.set(container, { opacity: 1 });
    playingRef.current = true;

    const tl = gsap.timeline({
      onComplete: () => {
        playingRef.current = false;
        gsap.to(container, {
          opacity: 0,
          duration: FADE,
          delay: HOLD,
          onComplete: () => {
            setPlay(false);
            useGLTF.clear(MODEL_URL);
          },
        });
      },
    });

    tl.to(progressRef, {
      current: 1,
      duration: DURATION,
      ease: "power2.inOut",
    });

    return () => {
      tl.kill();
    };
  }, [play, modelReady]);

  if (!play) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[15] overflow-hidden opacity-0"
    >
      {/* Só existe pra matemática do trajeto (getPointAtLength); nunca é visível. */}
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <path ref={geometryPathRef} fill="none" />
      </svg>

      <Canvas
        shadows
        orthographic
        camera={{ position: [0, 0, 100], zoom: 1, near: 0.1, far: 1000 }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 2]}
      >
        <ForceCanvasSize vw={dims.vw} vh={dims.vh} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 5]} intensity={1.15} castShadow />
        <Suspense fallback={null}>
          <Rig
            pathRef={geometryPathRef}
            vw={dims.vw}
            vh={dims.vh}
            narrow={narrow}
            playingRef={playingRef}
            progressRef={progressRef}
            onReady={() => setModelReady(true)}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL_URL);
