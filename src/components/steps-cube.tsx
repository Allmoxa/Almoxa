import { useNavigate } from "@tanstack/react-router";
import {
  useRef,
  useState,
  type CSSProperties,
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
// Graus por pixel arrastado -- ~90deg (uma face) a cada ~257px de arraste.
const DRAG_SENSITIVITY = 0.35;

const CARDBOARD = "#C19A6C";
const CARDBOARD_LIGHT = "#D8B78C";
const CARDBOARD_DARK = "#A9825A";
const CARDBOARD_DARKER = "#8F6E4A";
const INK = "#3B2A18";
const INK_SOFT = "#6B4E30";
const TAPE = "#EFE3CB";
const INDICATOR_INK = "#3B2A1E";

const corrugation: CSSProperties = {
  backgroundImage: `repeating-linear-gradient(90deg, rgba(59,42,24,0.09) 0px, rgba(59,42,24,0.09) 2px, transparent 2px, transparent 7px)`,
};

const faceSize: CSSProperties = { width: "var(--cube-size)", height: "var(--cube-size)" };

/** Quadrado torto com uma seta circular dentro -- mesmo espírito artesanal dos cantos da navbar. */
function SpinIndicatorIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
      <path
        d="M4 5.2 L25 3.4 L26.6 26 L3.2 25.1 Z"
        fill="none"
        stroke={INDICATOR_INK}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M19.6 10.6 A6.2 6.2 0 1 1 12.3 8.2"
        fill="none"
        stroke={INDICATOR_INK}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M12.3 8.2 L9.5 8.8 L11.4 11.4 Z" fill={INDICATOR_INK} stroke="none" />
    </svg>
  );
}

export function StepsCube({ steps }: { steps: Step[] }) {
  const [index, setIndex] = useState(0);
  const [opening, setOpening] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showIndicator, setShowIndicator] = useState(false);
  const navigate = useNavigate();

  const stageRef = useRef<HTMLDivElement | null>(null);
  const rotorRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  // Offset livre de arraste, em graus -- soma ao ângulo da face selecionada e
  // fica ali depois de soltar (não volta pra face mais próxima sozinho).
  const offsetRef = useRef(0);
  const dragRef = useRef({ pointerId: -1, startX: 0, startOffset: 0 });

  const currentAngle = () => index * -90 + offsetRef.current;

  const applyRotorTransform = () => {
    const el = rotorRef.current;
    if (!el) return;
    el.style.transform = `rotateX(${opening ? OPEN_TILT : TILT}deg) rotateY(${currentAngle()}deg) scale(${
      opening ? 1.16 : 1
    })`;
  };

  const handleTest = () => {
    if (opening) return;
    setOpening(true);
    window.setTimeout(() => {
      navigate({ to: "/auth" });
    }, OPEN_DURATION_MS);
  };

  const moveIndicator = (event: ReactPointerEvent<HTMLDivElement>) => {
    const indicator = indicatorRef.current;
    const stage = stageRef.current;
    if (!indicator || !stage) return;
    const rect = stage.getBoundingClientRect();
    indicator.style.transform = `translate3d(${event.clientX - rect.left}px, ${
      event.clientY - rect.top
    }px, 0)`;
  };

  const onPointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || opening) return;
    moveIndicator(event);
    setShowIndicator(true);
  };

  const onPointerLeave = () => {
    setShowIndicator(false);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && !opening) moveIndicator(event);

    if (dragRef.current.pointerId !== event.pointerId) return;
    const dx = event.clientX - dragRef.current.startX;
    offsetRef.current = dragRef.current.startOffset + dx * DRAG_SENSITIVITY;
    applyRotorTransform();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (opening || (event.pointerType === "mouse" && event.button !== 0)) return;
    stageRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startOffset: offsetRef.current,
    };
    if (rotorRef.current) rotorRef.current.style.transition = "none";
    setIsDragging(true);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current.pointerId = -1;
    if (rotorRef.current) rotorRef.current.style.transition = "";
    setIsDragging(false);
  };

  return (
    <div className="mx-auto w-fit max-w-full" style={{ "--cube-size": CUBE_SIZE } as CSSProperties}>
      <div
        ref={stageRef}
        className={`relative mx-auto max-w-full touch-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{
          perspective: 1400,
          width: "var(--cube-size)",
          height: "calc(var(--cube-size) + 40px)",
          userSelect: isDragging ? "none" : undefined,
        }}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
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
          ref={indicatorRef}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 z-20"
          style={{ opacity: showIndicator ? 1 : 0, transition: "opacity 200ms ease" }}
        >
          <div
            className="flex -translate-x-1/2 flex-col items-center transition-transform duration-200"
            style={{
              transform: `translateY(calc(-100% - 10px)) scale(${isDragging ? 0.85 : 1})`,
            }}
          >
            {!isDragging ? (
              <span
                className="mb-1 font-sans text-[11px] font-medium"
                style={{ color: INDICATOR_INK }}
              >
                Gire
              </span>
            ) : null}
            <SpinIndicatorIcon />
          </div>
        </div>

        <div
          ref={rotorRef}
          className="relative transition-all duration-700 ease-in-out"
          style={{
            ...faceSize,
            transformStyle: "preserve-3d",
            transform: `rotateX(${opening ? OPEN_TILT : TILT}deg) rotateY(${currentAngle()}deg) scale(${
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
            onClick={() => {
              offsetRef.current = 0;
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
