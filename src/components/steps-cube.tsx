import { useNavigate } from "@tanstack/react-router";
import { RotateCw } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

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
const INTERVAL_MS = 4200;
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

export function StepsCube({ steps }: { steps: Step[] }) {
  const [index, setIndex] = useState(0);
  const [opening, setOpening] = useState(false);
  const navigate = useNavigate();

  // setTimeout reagendado a cada troca de face (manual ou automática) em vez de
  // setInterval fixo: girar a caixa na mão sempre dá a volta inteira de novo,
  // sem o giro automático emendar em cima logo depois.
  useEffect(() => {
    if (opening) return;
    const id = window.setTimeout(() => {
      setIndex((i) => (i + 1) % steps.length);
    }, INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [index, opening, steps.length]);

  const spin = () => setIndex((i) => (i + 1) % steps.length);

  const handleTest = () => {
    if (opening) return;
    setOpening(true);
    window.setTimeout(() => {
      navigate({ to: "/auth" });
    }, OPEN_DURATION_MS);
  };

  return (
    <div className="mx-auto w-fit max-w-full" style={{ "--cube-size": CUBE_SIZE } as CSSProperties}>
      <div
        className="relative mx-auto max-w-full"
        style={{ perspective: 1400, width: "var(--cube-size)", height: "calc(var(--cube-size) + 40px)" }}
      >
        <div
          className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-700"
          style={{
            opacity: opening ? 1 : 0,
            background: "radial-gradient(circle at 50% 12%, rgba(255,250,235,0.95), transparent 62%)",
          }}
        />

        <button
          type="button"
          onClick={spin}
          disabled={opening}
          aria-label="Girar a caixa"
          title="Girar"
          className="absolute -right-3 -top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border-2 shadow-md transition-all duration-300 hover:-rotate-90 active:scale-90 disabled:pointer-events-none disabled:opacity-0"
          style={{ borderColor: INK, color: INK, backgroundColor: TAPE }}
        >
          <RotateCw className="h-4 w-4" strokeWidth={2.5} />
        </button>
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
              <p className="relative font-mono text-xs font-semibold tracking-widest" style={{ color: INK }}>
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
            onClick={() => setIndex(i)}
            disabled={opening}
            className="h-1.5 w-6 rounded-full transition-colors"
            style={{ backgroundColor: i === index ? CARDBOARD : undefined }}
          />
        ))}
      </div>
    </div>
  );
}
