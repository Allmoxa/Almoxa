import { useEffect, useRef, useState } from "react";

const FOLLOW_EASE = 0.16;
const TILT_EASE = 0.14;
const TILT_SENSITIVITY = 1.1;
const MAX_TILT_DEG = 9;
const HOVER_SCALE = 0.82;

const CARDBOARD = "#C19A6C";
const INK = "#3B2A18";

const INTERACTIVE_SELECTOR = "a, button, [role='button'], input, select, textarea, label";

/**
 * Cursor personalizado da home: "Gire" + miniatura da caixa, seguindo o
 * mouse com um pequeno atraso (lerp simples, sem overshoot — diferente do
 * spring do MagneticLink, aqui a caixa não pode "sobrar" rotação depois de
 * parar). A inclinação reage à velocidade do próprio seguidor (não do mouse
 * cru), pra não tremer em movimentos bruscos. Só roda em dispositivos com
 * mouse de verdade — telas de toque nunca disparam o efeito.
 */
export function SpinCursor() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [interactiveHover, setInteractiveHover] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const isTouchDevice = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    if (isTouchDevice) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let frame: number | null = null;
    let hasMoved = false;
    const raw = { x: 0, y: 0 };
    const pos = { x: 0, y: 0 };
    const prevPos = { x: 0, y: 0 };
    let tilt = 0;

    const tick = () => {
      pos.x += (raw.x - pos.x) * FOLLOW_EASE;
      pos.y += (raw.y - pos.y) * FOLLOW_EASE;

      if (!prefersReducedMotion) {
        const velocityX = pos.x - prevPos.x;
        const targetTilt = Math.max(
          -MAX_TILT_DEG,
          Math.min(MAX_TILT_DEG, velocityX * TILT_SENSITIVITY),
        );
        tilt += (targetTilt - tilt) * TILT_EASE;
      }

      prevPos.x = pos.x;
      prevPos.y = pos.y;

      wrap.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      if (boxRef.current) {
        boxRef.current.style.transform = `rotate(${tilt.toFixed(2)}deg)`;
      }

      frame = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (frame == null) frame = requestAnimationFrame(tick);
    };

    const onMouseMove = (event: MouseEvent) => {
      raw.x = event.clientX;
      raw.y = event.clientY;

      if (!hasMoved) {
        hasMoved = true;
        pos.x = prevPos.x = raw.x;
        pos.y = prevPos.y = raw.y;
        wrap.style.opacity = "1";
      }

      const target = event.target;
      const overInteractive = target instanceof Element && !!target.closest(INTERACTIVE_SELECTOR);
      setInteractiveHover(overInteractive);

      startLoop();
    };

    const onWindowLeave = () => {
      hasMoved = false;
      wrap.style.opacity = "0";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseleave", onWindowLeave);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onWindowLeave);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-[70] opacity-0"
      style={{ transition: "opacity 200ms ease", willChange: "transform" }}
    >
      <div className="flex -translate-x-1/2 -translate-y-[calc(100%+14px)] flex-col items-center">
        <span className="font-sans text-[11px] font-medium tracking-wide text-foreground">
          Gire
        </span>
        <div
          className="mt-1 transition-transform duration-300 ease-out"
          style={{ transform: `scale(${interactiveHover ? HOVER_SCALE : 1})` }}
        >
          <div ref={boxRef} style={{ willChange: "transform" }}>
            <svg width="34" height="30" viewBox="0 0 34 30" aria-hidden="true">
              <path
                d="M3 10 L9 3 H25 L31 10 V27 H3 Z"
                fill={CARDBOARD}
                stroke={INK}
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path d="M3 10 H31" stroke={INK} strokeWidth="1.2" opacity="0.55" />
              <path d="M17 3 V27" stroke={INK} strokeWidth="1" opacity="0.4" />
              <path
                d="M8 13 V24 M13 13 V24 M21 13 V24 M26 13 V24"
                stroke={INK}
                strokeWidth="0.8"
                opacity="0.3"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
