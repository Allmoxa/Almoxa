import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { springStep, type Vec2 } from "@/lib/spring";

const ZONE_PADDING = 60;
const MAX_OFFSET_X = 6;
const MAX_OFFSET_Y = 4;
const PULL_STRENGTH = 0.22;
const SETTLE_EPSILON = 0.03;

type Shape = "circle" | "underline" | "brackets";

const SHAPE: Record<
  Shape,
  { viewBox: string; d: string; svgClassName: string; preserveAspectRatio: string }
> = {
  circle: {
    viewBox: "0 0 100 50",
    preserveAspectRatio: "none",
    d: "M 22 4 C 8 6, 2 18, 3 26 C 4 36, 14 45, 32 46 C 55 48, 80 46, 92 40 C 99 36, 98 22, 93 14 C 87 5, 68 1, 48 2 C 38 2, 28 3, 22 4 Z",
    svgClassName: "absolute -inset-x-2 -inset-y-1.5 h-[calc(100%+0.75rem)] w-[calc(100%+1rem)]",
  },
  underline: {
    viewBox: "0 0 100 12",
    preserveAspectRatio: "none",
    d: "M 1 6 C 15 2, 28 9, 42 5 S 68 2, 82 6 S 96 8, 99 5",
    svgClassName: "absolute -bottom-2 left-0 h-2.5 w-full",
  },
  brackets: {
    viewBox: "0 0 100 50",
    preserveAspectRatio: "none",
    d: "M 4 9 C 20 6, 60 5, 96 7 C 98 20, 97 34, 95 44 C 65 47, 25 46, 4 43 C 2 32, 3 19, 4 9 Z",
    svgClassName: "absolute -inset-x-2.5 -inset-y-2 h-[calc(100%+1rem)] w-[calc(100%+1.25rem)]",
  },
};

type MagneticNavItemProps = {
  children: ReactNode;
  shape: Shape;
  /** "Início": indicador da página atual -- contorno sempre completo, sem desenhar/apagar. */
  alwaysDrawn?: boolean;
  labelClassName?: string;
  /** Rota interna (TanStack Router) -- use isto OU href, nunca os dois. */
  to?: string;
  /** Âncora na mesma página. */
  href?: string;
};

/**
 * Item de navbar com atração magnética + contorno desenhado à mão que surge
 * quando o cursor se aproxima (~60px antes de tocar no texto) e some no
 * sentido inverso ao afastar. Física do arrasto reaproveita o spring do
 * MagneticLink; o traço em si é puro CSS (stroke-dasharray/dashoffset via
 * data-drawn, ver .magnetic-outline-path em styles.css) -- só a detecção de
 * zona e o translate precisam de JS.
 */
export function MagneticNavItem({
  children,
  shape,
  alwaysDrawn = false,
  labelClassName = "",
  to,
  href,
}: MagneticNavItemProps) {
  const linkRef = useRef<HTMLAnchorElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const [drawn, setDrawn] = useState(alwaysDrawn);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (pathRef.current) {
      const length = pathRef.current.getTotalLength();
      pathRef.current.style.setProperty("--outline-length", `${length}`);
    }

    const link = linkRef.current;
    if (!link) return;

    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!canHover) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let frame: number | null = null;
    let inZone = false;
    const target: Vec2 = { x: 0, y: 0 };
    const pos: Vec2 = { x: 0, y: 0 };
    const vel: Vec2 = { x: 0, y: 0 };

    const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

    const tick = () => {
      const sx = springStep(pos.x, vel.x, target.x);
      const sy = springStep(pos.y, vel.y, target.y);
      pos.x = sx.position;
      vel.x = sx.velocity;
      pos.y = sy.position;
      vel.y = sy.velocity;

      link.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;

      const settled =
        !inZone &&
        Math.abs(vel.x) < SETTLE_EPSILON &&
        Math.abs(vel.y) < SETTLE_EPSILON &&
        Math.abs(pos.x) < SETTLE_EPSILON &&
        Math.abs(pos.y) < SETTLE_EPSILON;

      if (settled) {
        pos.x = pos.y = 0;
        link.style.transform = "translate3d(0, 0, 0)";
        link.style.willChange = "auto";
        frame = null;
        return;
      }

      frame = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (frame == null) {
        link.style.willChange = "transform";
        frame = requestAnimationFrame(tick);
      }
    };

    const onMouseMove = (event: MouseEvent) => {
      const rect = link.getBoundingClientRect();
      const withinZone =
        event.clientX >= rect.left - ZONE_PADDING &&
        event.clientX <= rect.right + ZONE_PADDING &&
        event.clientY >= rect.top - ZONE_PADDING &&
        event.clientY <= rect.bottom + ZONE_PADDING;

      if (withinZone) {
        if (!inZone) {
          inZone = true;
          if (!alwaysDrawn) setDrawn(true);
        }
        if (!prefersReducedMotion) {
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          target.x = clamp((event.clientX - centerX) * PULL_STRENGTH, MAX_OFFSET_X);
          target.y = clamp((event.clientY - centerY) * PULL_STRENGTH, MAX_OFFSET_Y);
          startLoop();
        }
      } else if (inZone) {
        inZone = false;
        if (!alwaysDrawn) setDrawn(false);
        if (!prefersReducedMotion) {
          target.x = 0;
          target.y = 0;
          startLoop();
        }
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [alwaysDrawn]);

  const shapeConfig = SHAPE[shape];

  const inner = (
    <>
      <span
        className="relative inline-block transition-transform duration-150 ease-out"
        style={{ transform: pressed ? "scale(0.97)" : "scale(1)" }}
      >
        <svg
          aria-hidden="true"
          viewBox={shapeConfig.viewBox}
          preserveAspectRatio={shapeConfig.preserveAspectRatio}
          className={`pointer-events-none ${shapeConfig.svgClassName}`}
        >
          <path
            ref={pathRef}
            d={shapeConfig.d}
            className="magnetic-outline-path"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className={`relative ${labelClassName}`}>{children}</span>
      </span>
    </>
  );

  const sharedProps = {
    className: "magnetic-nav-link relative inline-block text-foreground",
    "data-drawn": drawn ? "true" : undefined,
    onMouseDown: () => setPressed(true),
    onMouseUp: () => setPressed(false),
    onMouseLeave: () => setPressed(false),
  };

  if (to) {
    return (
      <Link ref={linkRef} to={to} {...sharedProps}>
        {inner}
      </Link>
    );
  }

  return (
    <a ref={linkRef} href={href ?? "#"} {...sharedProps}>
      {inner}
    </a>
  );
}
