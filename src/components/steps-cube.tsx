import { useNavigate } from "@tanstack/react-router";
import {
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Step = {
  label: string;
  title: string;
  text: string;
};

const FACE_ANGLES = [0, 90, 180] as const;
// Responsive: shrinks on narrow viewports so the box never overflows its column,
// caps at 340px on larger screens. All face sizing derives from this one variable.
const CUBE_SIZE = "clamp(220px, 72vw, 340px)";
const HALF = "calc(var(--cube-size) / 2)";
const TILT = -14;
const OPEN_TILT = -66;
const OPEN_DURATION_MS = 750;

const CARDBOARD = "#C19A6C";
const CARDBOARD_LIGHT = "#D8B78C";
const CARDBOARD_DARK = "#A9825A";
const CARDBOARD_DARKER = "#8F6E4A";
const INK = "#3B2A18";
const INK_SOFT = "#6B4E30";
const TAPE = "#EFE3CB";

const corrugation: CSSProperties = {
  backgroundImage: `repeating-linear-gradient(90deg, rgba(59,42,24,0.09) 0px, rgba(59,42,24,0.09) 2px, transparent 2px, transparent 7px)`,
};

const faceSize: CSSProperties = { width: "var(--cube-size)", height: "var(--cube-size)" };

// --- Botão circular de rotação ---
const BUTTON_SIZE = 46;
const BUTTON_GAP = 18;
const BUTTON_MARGIN = 8;
const FOLLOW_EASE = 0.14;
const PRESS_SPIN_MS = 380;
const BUTTON_BG = "#11110F";
const ARROW_COLOR = "#F5EBDD";
// Some encolhendo até quase sumir, não só um fade -- "minúsculo", não 0.85.
const HIDDEN_SCALE = 0.12;

export function StepsCube({ steps }: { steps: Step[] }) {
  const [index, setIndex] = useState(0);
  const [opening, setOpening] = useState(false);
  const [buttonVisible, setButtonVisible] = useState(false);
  const [pressed, setPressed] = useState(false);
  const navigate = useNavigate();

  const stageRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const arrowRef = useRef<SVGSVGElement | null>(null);

  // Estado do botão-seguidor: um rAF só, cuidando de posição (lerp) e do giro
  // de entrada da seta.
  const followRef = useRef({
    frame: null as number | null,
    targetX: 0,
    targetY: 0,
    currentX: 0,
    currentY: 0,
    pressStart: 0,
    reduceMotion: false,
  });

  const handleTest = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (opening) return;
    setOpening(true);
    window.setTimeout(() => {
      navigate({ to: "/auth" });
    }, OPEN_DURATION_MS);
  };

  const clampButtonPosition = (
    cursorX: number,
    cursorY: number,
    stageW: number,
    stageH: number,
  ) => {
    let x = cursorX + BUTTON_GAP;
    let y = cursorY + BUTTON_GAP;
    if (x + BUTTON_SIZE + BUTTON_MARGIN > stageW) x = cursorX - BUTTON_GAP - BUTTON_SIZE;
    if (y + BUTTON_SIZE + BUTTON_MARGIN > stageH) y = cursorY - BUTTON_GAP - BUTTON_SIZE;
    const maxX = Math.max(BUTTON_MARGIN, stageW - BUTTON_SIZE - BUTTON_MARGIN);
    const maxY = Math.max(BUTTON_MARGIN, stageH - BUTTON_SIZE - BUTTON_MARGIN);
    return {
      x: Math.min(Math.max(x, BUTTON_MARGIN), maxX),
      y: Math.min(Math.max(y, BUTTON_MARGIN), maxY),
    };
  };

  const tick = () => {
    const state = followRef.current;
    const button = buttonRef.current;
    if (!button) return;

    if (state.reduceMotion) {
      state.currentX = state.targetX;
      state.currentY = state.targetY;
    } else {
      state.currentX += (state.targetX - state.currentX) * FOLLOW_EASE;
      state.currentY += (state.targetY - state.currentY) * FOLLOW_EASE;
    }
    button.style.transform = `translate3d(${state.currentX}px, ${state.currentY}px, 0)`;

    let spin = 0;
    if (!state.reduceMotion && state.pressStart > 0) {
      const elapsed = performance.now() - state.pressStart;
      if (elapsed < PRESS_SPIN_MS) {
        const t = elapsed / PRESS_SPIN_MS;
        spin = (1 - Math.pow(1 - t, 3)) * 360;
      } else {
        state.pressStart = 0;
      }
    }
    if (arrowRef.current) {
      arrowRef.current.style.transform = `rotate(${spin}deg)`;
    }

    const settled =
      !state.reduceMotion &&
      state.pressStart === 0 &&
      Math.abs(state.targetX - state.currentX) < 0.05 &&
      Math.abs(state.targetY - state.currentY) < 0.05;

    if (settled || state.reduceMotion) {
      state.frame = null;
      button.style.willChange = "auto";
      return;
    }

    state.frame = requestAnimationFrame(tick);
  };

  const startFollowLoop = () => {
    const state = followRef.current;
    if (state.frame == null) {
      if (buttonRef.current) buttonRef.current.style.willChange = "transform";
      state.frame = requestAnimationFrame(tick);
    }
  };

  const setFollowTarget = (event: ReactPointerEvent<HTMLDivElement>, snap: boolean) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const { x, y } = clampButtonPosition(cursorX, cursorY, rect.width, rect.height);
    const state = followRef.current;
    state.targetX = x;
    state.targetY = y;
    if (snap) {
      state.currentX = x;
      state.currentY = y;
      if (buttonRef.current) buttonRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  };

  const onPointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || opening) return;
    followRef.current.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setFollowTarget(event, true);
    setButtonVisible(true);
    startFollowLoop();
  };

  const onPointerLeave = () => {
    setButtonVisible(false);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || opening) return;
    setFollowTarget(event, false);
    startFollowLoop();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (opening || (event.pointerType === "mouse" && event.button !== 0)) return;
    setPressed(true);
    if (!followRef.current.reduceMotion) {
      followRef.current.pressStart = performance.now();
      startFollowLoop();
    }
  };

  const endPress = () => setPressed(false);

  // Um clique em qualquer ponto da caixa gira pra próxima face -- sem
  // arrastar, sem segurar. O botão "Testar" já para a propagação antes de
  // chegar aqui.
  const spin = () => {
    if (opening) return;
    setIndex((i) => (i + 1) % steps.length);
  };

  return (
    <div className="mx-auto w-fit max-w-full" style={{ "--cube-size": CUBE_SIZE } as CSSProperties}>
      <div
        ref={stageRef}
        className="relative mx-auto max-w-full cursor-pointer select-none"
        style={{
          perspective: 1400,
          width: "var(--cube-size)",
          height: "calc(var(--cube-size) + 40px)",
        }}
        onClick={spin}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={endPress}
        onPointerCancel={endPress}
      >
        <div
          className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-700"
          style={{
            opacity: opening ? 1 : 0,
            background:
              "radial-gradient(circle at 50% 12%, rgba(255,250,235,0.95), transparent 62%)",
          }}
        />

        <div
          className="relative transition-all duration-700 ease-in-out"
          style={{
            ...faceSize,
            transformStyle: "preserve-3d",
            transform: `rotateX(${opening ? OPEN_TILT : TILT}deg) rotateY(${index * -90}deg) scale(${
              opening ? 1.16 : 1
            })`,
            opacity: opening ? 0.4 : 1,
          }}
        >
          {steps.map((step, i) => (
            <article
              key={step.label}
              className="absolute flex flex-col justify-center gap-3 border border-black/10 px-6 shadow-[0_18px_40px_-20px_rgba(59,42,24,0.45)] sm:gap-4 sm:px-10"
              style={{
                ...faceSize,
                backgroundColor: CARDBOARD,
                ...corrugation,
                transform: `rotateY(${FACE_ANGLES[i]}deg) translateZ(${HALF})`,
              }}
            >
              <p
                className="relative font-mono text-xs font-semibold tracking-widest"
                style={{ color: INK }}
              >
                {step.label}
              </p>
              <div className="relative -mx-3 py-2">
                <span
                  className="absolute inset-y-0 left-0 -z-10 w-[calc(100%+1.5rem)] -rotate-1 opacity-95 shadow-sm"
                  style={{ backgroundColor: TAPE }}
                />
                <h2 className="px-3 text-2xl sm:text-3xl" style={{ color: INK }}>
                  {step.title}
                </h2>
              </div>
              <p className="relative max-w-sm text-sm" style={{ color: INK_SOFT }}>
                {step.text}
              </p>

              {i === steps.length - 1 ? (
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={handleTest}
                  className="relative mt-2 inline-flex w-fit items-center gap-2 rounded-sm border-2 px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-widest transition-transform hover:-translate-y-0.5 active:translate-y-0"
                  style={{ borderColor: INK, color: INK, backgroundColor: TAPE }}
                >
                  Testar →
                </button>
              ) : null}
            </article>
          ))}

          <div
            className="absolute border border-black/10"
            style={{
              ...faceSize,
              backgroundColor: CARDBOARD_DARK,
              ...corrugation,
              transform: `rotateY(-90deg) translateZ(${HALF})`,
            }}
          />

          <div
            className="absolute overflow-hidden border border-black/10"
            style={{
              ...faceSize,
              backgroundColor: CARDBOARD_DARKER,
              transform: `rotateX(90deg) translateZ(${HALF})`,
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                clipPath: "polygon(0% 0%, 100% 0%, 58% 100%, 0% 100%)",
                background: `linear-gradient(135deg, ${CARDBOARD_LIGHT}, ${CARDBOARD})`,
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 42% 100%)",
                background: `linear-gradient(225deg, ${CARDBOARD_LIGHT}, ${CARDBOARD})`,
              }}
            />
            <span
              className="absolute h-5 w-[55%] -ml-[27.5%] rotate-90"
              style={{
                left: "50%",
                top: "35%",
                backgroundColor: TAPE,
                opacity: 0.92,
              }}
            />
          </div>

          <div
            className="absolute border border-black/10"
            style={{
              ...faceSize,
              backgroundColor: CARDBOARD_DARKER,
              ...corrugation,
              transform: `rotateX(-90deg) translateZ(${HALF})`,
            }}
          />
        </div>

        {/* Depois do rotor no DOM de propósito -- fica sempre por cima das faces 3D. */}
        <div
          ref={buttonRef}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 z-50"
          style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }}
        >
          <div
            className="h-full w-full transition-[opacity,transform] duration-300 ease-out"
            style={{
              opacity: buttonVisible ? 1 : 0,
              transform: `scale(${buttonVisible ? 1 : HIDDEN_SCALE})`,
            }}
          >
            <div
              className="h-full w-full transition-transform duration-150 ease-out"
              style={{ transform: `scale(${pressed ? 0.9 : 1})` }}
            >
              <div
                className="flex h-full w-full items-center justify-center rounded-full shadow-[0_6px_16px_-4px_rgba(0,0,0,0.35)]"
                style={{ backgroundColor: BUTTON_BG }}
              >
                <svg
                  ref={arrowRef}
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  aria-hidden="true"
                  style={{ transformOrigin: "50% 50%" }}
                >
                  <path
                    d="M14.3 5.6 A6 6 0 1 1 9.2 3"
                    fill="none"
                    stroke={ARROW_COLOR}
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                  <path d="M14.3 5.6 L15.1 2.2 L11.6 3.5 Z" fill={ARROW_COLOR} />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="mt-10 flex justify-center gap-2 transition-opacity duration-500"
        style={{ opacity: opening ? 0 : 1 }}
      >
        {steps.map((step, i) => (
          <button
            key={step.label}
            type="button"
            aria-label={`Ver passo ${step.label}`}
            onClick={(event) => {
              event.stopPropagation();
              setIndex(i);
            }}
            disabled={opening}
            className="h-1.5 w-6 rounded-full transition-colors"
            style={{ backgroundColor: i === index ? CARDBOARD : undefined }}
          />
        ))}
      </div>
    </div>
  );
}
