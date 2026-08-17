import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

const TAPE_THICKNESS = 64;
const DURATION = 5.5;
const HOLD_BEFORE_FADE = 1;
const FADE_DURATION = 1.1;

function TapeDispenserIcon() {
  return (
    <svg
      width="112"
      height="78"
      viewBox="0 0 112 78"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M11 56 4 75 28 62Z" fill="#2A1E12" />
      <rect x="5" y="32" width="51" height="28" rx="6" fill="#2A1E12" />
      <circle cx="73" cy="37" r="36" fill="#2A1E12" />
      <circle cx="73" cy="37" r="25" fill="#D8B78C" />
      <circle cx="73" cy="37" r="23" fill="none" stroke="#EFE3CB" strokeWidth="3" opacity="0.6" />
      <circle cx="73" cy="37" r="9" fill="#2A1E12" />
    </svg>
  );
}

/**
 * Caminho: entra fora da tela no canto superior direito, mergulha atrás da
 * caixa (StepsCube), reaparece do lado esquerdo dela, desce pelo vão entre a
 * coluna de texto e a caixa — sem cruzar nem texto nem botão — e sai fora da
 * tela no canto inferior esquerdo. Medido a partir da posição real dos
 * elementos na tela, não é uma diagonal fixa.
 */
function buildPath(heroRect: DOMRect, boxRect: DOMRect, vw: number, vh: number) {
  const p0 = { x: vw + 140, y: -140 };
  const p1 = { x: boxRect.right + 40, y: boxRect.top - 90 };
  const p2 = { x: (boxRect.left + boxRect.right) / 2, y: (boxRect.top + boxRect.bottom) / 2 };
  const p3 = { x: boxRect.left - 60, y: boxRect.bottom - 20 };
  const gapX = Math.max(heroRect.right + 50, boxRect.left - 100);
  const belowY = Math.max(heroRect.bottom, boxRect.bottom) + 70;
  const p4 = { x: gapX, y: belowY };
  const p5 = { x: heroRect.left - 90, y: vh * 0.94 };
  const p6 = { x: -160, y: vh + 160 };

  const d =
    `M ${p0.x} ${p0.y} ` +
    `C ${p0.x - 120} ${p0.y + 80}, ${p1.x + 80} ${p1.y - 60}, ${p1.x} ${p1.y} ` +
    `S ${p2.x} ${p2.y}, ${p3.x} ${p3.y} ` +
    `C ${p3.x - 60} ${p3.y + 60}, ${p4.x + 40} ${p4.y - 60}, ${p4.x} ${p4.y} ` +
    `C ${p4.x - 60} ${p4.y + 80}, ${p5.x + 80} ${p5.y - 90}, ${p5.x} ${p5.y} ` +
    `S ${p6.x} ${p6.y}, ${p6.x} ${p6.y}`;

  return d;
}

export function TapeIntro() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const sheenRef = useRef<SVGPathElement>(null);
  const dispenserRef = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setPlay(true);
  }, []);

  useEffect(() => {
    if (!play) return;
    const container = containerRef.current;
    const svg = svgRef.current;
    const path = pathRef.current;
    const sheen = sheenRef.current;
    const dispenser = dispenserRef.current;
    const heroEl = document.querySelector<HTMLElement>('[data-tape-hero="true"]');
    const boxEl = document.querySelector<HTMLElement>('[data-tape-box="true"]');
    if (!container || !svg || !path || !sheen || !dispenser || !heroEl || !boxEl) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const heroRect = heroEl.getBoundingClientRect();
    const boxRect = boxEl.getBoundingClientRect();

    svg.setAttribute("width", String(vw));
    svg.setAttribute("height", String(vh));

    const d = buildPath(heroRect, boxRect, vw, vh);
    path.setAttribute("d", d);
    sheen.setAttribute("d", d);

    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    sheen.style.strokeDasharray = `${length}`;
    sheen.style.strokeDashoffset = `${length}`;

    gsap.set(container, { opacity: 1 });

    const progress = { t: 0 };
    const EPS = Math.max(length * 0.002, 1);

    const positionDispenser = (t: number) => {
      const at = Math.min(t * length, length);
      const point = path.getPointAtLength(at);
      const ahead = path.getPointAtLength(Math.min(at + EPS, length));
      const angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) * (180 / Math.PI);
      gsap.set(dispenser, { x: point.x, y: point.y, rotate: angle });
    };

    positionDispenser(0);

    const tl = gsap.timeline({
      onComplete: () => {
        gsap.to(container, {
          opacity: 0,
          duration: FADE_DURATION,
          delay: HOLD_BEFORE_FADE,
          onComplete: () => setPlay(false),
        });
      },
    });

    tl.to(progress, {
      t: 1,
      duration: DURATION,
      ease: "power1.inOut",
      onUpdate: () => {
        const offset = length * (1 - progress.t);
        path.style.strokeDashoffset = `${offset}`;
        sheen.style.strokeDashoffset = `${offset}`;
        positionDispenser(progress.t);
      },
    });

    return () => {
      tl.kill();
    };
  }, [play]);

  if (!play) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[15] overflow-hidden opacity-0"
    >
      <svg
        ref={svgRef}
        className="absolute left-0 top-0"
        style={{ filter: "drop-shadow(0 10px 16px rgba(59,42,24,0.4))" }}
      >
        <path
          ref={pathRef}
          fill="none"
          stroke="rgba(216, 183, 140, 0.62)"
          strokeWidth={TAPE_THICKNESS}
          strokeLinecap="round"
        />
        <path
          ref={sheenRef}
          fill="none"
          stroke="rgba(255, 255, 255, 0.32)"
          strokeWidth={TAPE_THICKNESS * 0.16}
          strokeLinecap="round"
        />
      </svg>
      <div ref={dispenserRef} className="absolute -ml-6 -mt-9">
        <TapeDispenserIcon />
      </div>
    </div>
  );
}
