import { useEffect, useState, type CSSProperties } from "react";

type Step = {
  label: string;
  title: string;
  text: string;
};

const FACE_ANGLES = [0, 90, 180] as const;
const SIZE = 340;
const HALF = SIZE / 2;
const INTERVAL_MS = 4200;
const TILT = -14;

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

export function StepsCube({ steps }: { steps: Step[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % steps.length);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [steps.length]);

  return (
    <section className="border-b border-border py-24">
      <div className="mx-auto" style={{ perspective: 1400, width: SIZE, height: SIZE + 40 }}>
        <div
          className="relative transition-transform duration-700 ease-in-out"
          style={{
            width: SIZE,
            height: SIZE,
            transformStyle: "preserve-3d",
            transform: `rotateX(${TILT}deg) rotateY(${index * -90}deg)`,
          }}
        >
          {steps.map((step, i) => (
            <article
              key={step.label}
              className="absolute flex flex-col justify-center gap-4 border border-black/10 px-10 shadow-[0_18px_40px_-20px_rgba(59,42,24,0.45)]"
              style={{
                width: SIZE,
                height: SIZE,
                backgroundColor: CARDBOARD,
                ...corrugation,
                transform: `rotateY(${FACE_ANGLES[i]}deg) translateZ(${HALF}px)`,
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
                <h2 className="px-3 text-3xl" style={{ color: INK }}>
                  {step.title}
                </h2>
              </div>
              <p className="relative max-w-sm text-sm" style={{ color: INK_SOFT }}>
                {step.text}
              </p>
            </article>
          ))}

          <div
            className="absolute border border-black/10"
            style={{
              width: SIZE,
              height: SIZE,
              backgroundColor: CARDBOARD_DARK,
              ...corrugation,
              transform: `rotateY(-90deg) translateZ(${HALF}px)`,
            }}
          />

          <div
            className="absolute overflow-hidden border border-black/10"
            style={{
              width: SIZE,
              height: SIZE,
              backgroundColor: CARDBOARD_DARKER,
              transform: `rotateX(90deg) translateZ(${HALF}px)`,
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
              className="absolute h-5 rotate-90"
              style={{
                left: "50%",
                top: "35%",
                width: SIZE * 0.55,
                marginLeft: -(SIZE * 0.55) / 2,
                backgroundColor: TAPE,
                opacity: 0.92,
              }}
            />
          </div>

          <div
            className="absolute border border-black/10"
            style={{
              width: SIZE,
              height: SIZE,
              backgroundColor: CARDBOARD_DARKER,
              ...corrugation,
              transform: `rotateX(-90deg) translateZ(${HALF}px)`,
            }}
          />
        </div>
      </div>

      <div className="mt-10 flex justify-center gap-2">
        {steps.map((step, i) => (
          <button
            key={step.label}
            type="button"
            aria-label={`Ver passo ${step.label}`}
            onClick={() => setIndex(i)}
            className="h-1.5 w-6 rounded-full transition-colors"
            style={{ backgroundColor: i === index ? CARDBOARD : undefined }}
          />
        ))}
      </div>
    </section>
  );
}
