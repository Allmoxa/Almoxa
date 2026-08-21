import { useEffect, useRef } from "react";
import { springStep } from "@/lib/spring";

const VIEW_W = 1000;
const VIEW_H = 12;
const POINTS = 56;
/** Quanto a linha consegue se deformar em direção ao cursor, em unidades do viewBox. */
const MAX_PULL = 4.6;
/** Alcance horizontal do puxão ao redor do X do cursor, também em unidades do viewBox. */
const PULL_RADIUS_X = 220;
/** Distância vertical (em px de tela) até onde o puxão ainda é sentido. */
const PULL_RANGE_Y = 200;

/** Leve ondulação de base, pra continuar parecendo desenhada à mão mesmo parada. */
const baseY = (x: number) =>
  VIEW_H / 2 +
  2.6 * Math.sin((x / VIEW_W) * Math.PI * 2 + 0.6) +
  1.1 * Math.sin((x / VIEW_W) * Math.PI * 5 + 2.1);

/**
 * Linha horizontal ondulada, sangrando até a borda da tela, separando o
 * header do resto -- agora reage ao cursor como uma corda: quanto mais perto
 * o mouse passa (na vertical), mais forte ela é puxada, e o ponto do puxão
 * segue o X do cursor. Longe do cursor, ela some de volta pra ondulação de
 * base sozinha, com a mesma mola amortecida dos botões magnéticos da home.
 */
export function SketchDivider() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const path = pathRef.current;
    if (!svg || !path) return;

    const points = Array.from({ length: POINTS }, (_, i) => {
      const x = (i / (POINTS - 1)) * VIEW_W;
      return { x, pos: baseY(x), vel: 0, target: baseY(x) };
    });

    const draw = () => {
      let d = "";
      points.forEach((p, i) => {
        d += `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.pos.toFixed(2)} `;
      });
      path.setAttribute("d", d);
    };
    draw();

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (prefersReducedMotion || !canHover) return;

    let frame: number | null = null;
    let lastMouseX = -9999;
    let lastMouseY = -9999;

    const tick = () => {
      let settled = true;
      for (const p of points) {
        const step = springStep(p.pos, p.vel, p.target);
        p.pos = step.position;
        p.vel = step.velocity;
        if (Math.abs(step.velocity) > 0.01 || Math.abs(p.pos - p.target) > 0.01) {
          settled = false;
        }
      }
      draw();
      frame = settled ? null : requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (frame == null) frame = requestAnimationFrame(tick);
    };

    const updateTargets = () => {
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;
      const centerY = rect.top + rect.height / 2;
      const dy = lastMouseY - centerY;
      const yFactor = Math.max(0, 1 - Math.abs(dy) / PULL_RANGE_Y);
      const sign = Math.sign(dy);
      const mouseXViewBox = ((lastMouseX - rect.left) / rect.width) * VIEW_W;

      for (const p of points) {
        const dx = p.x - mouseXViewBox;
        const xFactor = Math.exp(-((dx / PULL_RADIUS_X) ** 2));
        p.target = baseY(p.x) + MAX_PULL * yFactor * xFactor * sign;
      }
      startLoop();
    };

    const onMouseMove = (event: MouseEvent) => {
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
      updateTargets();
    };

    // A rolagem muda a posição da linha na tela sem o mouse se mexer -- sem
    // isso, puxar a página pra baixo até a linha "andar até" um cursor parado
    // não teria efeito nenhum até o próximo movimento real do mouse.
    const onScroll = () => updateTargets();

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("scroll", onScroll);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] h-3 w-screen overflow-hidden">
      <svg
        ref={svgRef}
        aria-hidden="true"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="h-full w-full text-border-strong"
      >
        <path
          ref={pathRef}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
