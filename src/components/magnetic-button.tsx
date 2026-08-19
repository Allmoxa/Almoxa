import { useEffect, useRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { springStep, type Vec2 } from "@/lib/spring";

type MagneticLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, "children"> & {
  children?: ReactNode;
};

const BUTTON_STRENGTH = 0.22;
const TEXT_STRENGTH = 0.12;
const MAX_OFFSET_PX = 16;
const SETTLE_EPSILON = 0.03;

/**
 * Botão magnético: segue o cursor com o próprio elemento (20-25% da
 * distância até o centro) e o texto por dentro dele com menos intensidade
 * (10-15%), via um spring amortecido rodando em requestAnimationFrame — o
 * leve overshoot do spring é o que dá o "elástico" ao soltar o mouse.
 * Desativado com prefers-reduced-motion e em telas touch (sem hover real).
 */
export function MagneticLink({ children, ...props }: MagneticLinkProps) {
  const buttonRef = useRef<HTMLAnchorElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const button = buttonRef.current;
    const text = textRef.current;
    if (!button || !text) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouchDevice = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    if (prefersReducedMotion || isTouchDevice) return;

    let frame: number | null = null;
    let hovering = false;
    const target: Vec2 = { x: 0, y: 0 };
    const buttonPos: Vec2 = { x: 0, y: 0 };
    const buttonVel: Vec2 = { x: 0, y: 0 };
    const textPos: Vec2 = { x: 0, y: 0 };
    const textVel: Vec2 = { x: 0, y: 0 };

    const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
    const textMaxOffsetPx = MAX_OFFSET_PX * (TEXT_STRENGTH / BUTTON_STRENGTH);

    const tick = () => {
      const bx = springStep(buttonPos.x, buttonVel.x, target.x);
      const by = springStep(buttonPos.y, buttonVel.y, target.y);
      buttonPos.x = clamp(bx.position, MAX_OFFSET_PX);
      buttonVel.x = bx.velocity;
      buttonPos.y = clamp(by.position, MAX_OFFSET_PX);
      buttonVel.y = by.velocity;

      const textTargetX = target.x * (TEXT_STRENGTH / BUTTON_STRENGTH);
      const textTargetY = target.y * (TEXT_STRENGTH / BUTTON_STRENGTH);
      const tx = springStep(textPos.x, textVel.x, textTargetX);
      const ty = springStep(textPos.y, textVel.y, textTargetY);
      textPos.x = clamp(tx.position, textMaxOffsetPx);
      textVel.x = tx.velocity;
      textPos.y = clamp(ty.position, textMaxOffsetPx);
      textVel.y = ty.velocity;

      button.style.transform = `translate3d(${buttonPos.x}px, ${buttonPos.y}px, 0)`;
      text.style.transform = `translate3d(${textPos.x}px, ${textPos.y}px, 0)`;

      const settled =
        !hovering &&
        Math.abs(buttonVel.x) < SETTLE_EPSILON &&
        Math.abs(buttonVel.y) < SETTLE_EPSILON &&
        Math.abs(buttonPos.x) < SETTLE_EPSILON &&
        Math.abs(buttonPos.y) < SETTLE_EPSILON &&
        Math.abs(textVel.x) < SETTLE_EPSILON &&
        Math.abs(textVel.y) < SETTLE_EPSILON;

      if (settled) {
        buttonPos.x = buttonPos.y = textPos.x = textPos.y = 0;
        button.style.transform = "translate3d(0, 0, 0)";
        text.style.transform = "translate3d(0, 0, 0)";
        frame = null;
        return;
      }

      frame = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (frame == null) frame = requestAnimationFrame(tick);
    };

    const onMouseMove = (event: MouseEvent) => {
      const rect = button.getBoundingClientRect();
      target.x = clamp(
        (event.clientX - (rect.left + rect.width / 2)) * BUTTON_STRENGTH,
        MAX_OFFSET_PX,
      );
      target.y = clamp(
        (event.clientY - (rect.top + rect.height / 2)) * BUTTON_STRENGTH,
        MAX_OFFSET_PX,
      );
      hovering = true;
      startLoop();
    };

    const onMouseLeave = () => {
      hovering = false;
      target.x = 0;
      target.y = 0;
      startLoop();
    };

    button.addEventListener("mousemove", onMouseMove);
    button.addEventListener("mouseleave", onMouseLeave);

    return () => {
      button.removeEventListener("mousemove", onMouseMove);
      button.removeEventListener("mouseleave", onMouseLeave);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <Link ref={buttonRef} {...props} style={{ willChange: "transform" }}>
      <span ref={textRef} className="inline-block" style={{ willChange: "transform" }}>
        {children}
      </span>
    </Link>
  );
}
