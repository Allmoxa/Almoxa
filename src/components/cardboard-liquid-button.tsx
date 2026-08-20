import { Link } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { springStep, type Vec2 } from "@/lib/spring";

const ZONE_PADDING = 36;
const MAX_OFFSET_PX = 7;
const PULL_STRENGTH = 0.28;
const SETTLE_EPSILON = 0.03;

/**
 * Botão circular "papelão seco absorvendo líquido" -- o preenchimento e o
 * texto creme recortado vivem inteiramente em CSS (ver .cardboard-liquid-*
 * em styles.css, disparado por :hover/:focus-visible/:active). Só o
 * magnetismo (puxão de até 7px em direção ao cursor, começando ~36px antes
 * de tocar o botão -- zona curta de propósito, pra não brigar com um botão
 * vizinho perto) precisa de JS, e segue o mesmo spring amortecido do
 * MagneticNavItem -- só que num único elemento, já que aqui não tem texto se
 * movendo por dentro do botão.
 *
 * `to` navega (Entrar na conta); `onClick` só dispara uma ação (Criar conta
 * abre o dialog) -- nunca os dois. `variant="secondary"` é o mesmo círculo em
 * versão contorno (papelão sem o preenchimento seco), pra par com o botão
 * principal sem competir com ele.
 */
export function CardboardLiquidButton({
  to,
  onClick,
  variant = "primary",
  ariaLabel,
  children,
}: {
  to?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  ariaLabel: string;
  children: ReactNode;
}) {
  // HTMLElement, não HTMLAnchorElement: precisa caber tanto <a>/Link quanto
  // <button> (modo onClick), igual ao MagneticNavItem.
  const linkRef = useRef<HTMLElement | null>(null);
  const setLinkRef = (el: HTMLElement | null) => {
    linkRef.current = el;
  };

  useEffect(() => {
    const link = linkRef.current;
    if (!link) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouchDevice = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    if (prefersReducedMotion || isTouchDevice) return;

    let frame: number | null = null;
    let inZone = false;
    const target: Vec2 = { x: 0, y: 0 };
    const pos: Vec2 = { x: 0, y: 0 };
    const vel: Vec2 = { x: 0, y: 0 };

    const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

    const tick = () => {
      const sx = springStep(pos.x, vel.x, target.x);
      const sy = springStep(pos.y, vel.y, target.y);
      pos.x = clamp(sx.position, MAX_OFFSET_PX);
      vel.x = sx.velocity;
      pos.y = clamp(sy.position, MAX_OFFSET_PX);
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
        frame = null;
        return;
      }

      frame = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (frame == null) frame = requestAnimationFrame(tick);
    };

    // Ouve na window, não no próprio link: o ímã precisa puxar antes do
    // cursor tocar o botão, então a zona de atração se estende ZONE_PADDING
    // além do retângulo real (mesmo padrão do MagneticNavItem).
    const onMouseMove = (event: MouseEvent) => {
      const rect = link.getBoundingClientRect();
      const withinZone =
        event.clientX >= rect.left - ZONE_PADDING &&
        event.clientX <= rect.right + ZONE_PADDING &&
        event.clientY >= rect.top - ZONE_PADDING &&
        event.clientY <= rect.bottom + ZONE_PADDING;

      if (withinZone) {
        inZone = true;
        target.x = clamp(
          (event.clientX - (rect.left + rect.width / 2)) * PULL_STRENGTH,
          MAX_OFFSET_PX,
        );
        target.y = clamp(
          (event.clientY - (rect.top + rect.height / 2)) * PULL_STRENGTH,
          MAX_OFFSET_PX,
        );
        startLoop();
      } else if (inZone) {
        inZone = false;
        target.x = 0;
        target.y = 0;
        startLoop();
      }
    };

    window.addEventListener("mousemove", onMouseMove);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, []);

  const circle = (
    <span className="cardboard-liquid-circle relative flex items-center justify-center overflow-hidden rounded-full">
      <span className="cardboard-liquid-dry absolute inset-0 rounded-full" />

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <path
          d="M52 2 C 78 1, 98 21, 99 49 C 100 76, 80 99, 52 98 C 25 97, 1 78, 2 50 C 3 23, 26 3, 52 2 Z"
          fill="none"
          stroke="#49392C"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <span className="cardboard-liquid-wet absolute inset-0">
        <svg
          className="cardboard-liquid-wave cardboard-liquid-wave-a absolute inset-x-0 -top-[6%] h-[16%] w-full"
          viewBox="0 0 100 16"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 9 C 16 3, 34 13, 50 8 C 66 3, 84 13, 100 8 V16 H0 Z" fill="#302D28" />
        </svg>
        <svg
          className="cardboard-liquid-wave cardboard-liquid-wave-b absolute inset-x-0 -top-[6%] h-[16%] w-full"
          viewBox="0 0 100 16"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0 11 C 20 15, 38 5, 56 10 C 72 14, 88 6, 100 10 V16 H0 Z"
            fill="#302D28"
            opacity="0.55"
          />
        </svg>
        <span className="absolute inset-x-0 top-[9%] bottom-0 bg-[#302D28]" />
      </span>

      <span className="cardboard-liquid-label relative z-10 flex flex-col items-center justify-center gap-0.5 px-3 text-center font-sans text-xs font-medium text-[#2E2924] sm:text-sm">
        <span>
          {children}
          <span className="cardboard-liquid-arrow ml-1 inline-block" aria-hidden="true">
            ↗
          </span>
        </span>
      </span>
      <span
        aria-hidden="true"
        className="cardboard-liquid-label cardboard-liquid-label-wet absolute inset-0 z-10 flex flex-col items-center justify-center gap-0.5 px-3 text-center font-sans text-xs font-medium text-[#F7EEDC] sm:text-sm"
      >
        <span>
          {children}
          <span className="cardboard-liquid-arrow ml-1 inline-block" aria-hidden="true">
            ↗
          </span>
        </span>
      </span>
    </span>
  );

  const className = `cardboard-liquid-button relative mt-10 inline-flex shrink-0 ${
    variant === "secondary" ? "cardboard-liquid-secondary" : ""
  }`;

  if (to) {
    return (
      <Link
        ref={setLinkRef}
        to={to}
        aria-label={ariaLabel}
        className={className}
        style={{ willChange: "transform" }}
      >
        {circle}
      </Link>
    );
  }

  return (
    <button
      ref={setLinkRef}
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={className}
      style={{ willChange: "transform" }}
    >
      {circle}
    </button>
  );
}
