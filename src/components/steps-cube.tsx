import { useEffect, useState } from "react";

type Step = {
  label: string;
  title: string;
  text: string;
};

const FACE_ANGLES = [0, 90, 180] as const;
const SIZE = 168;
const HALF = SIZE / 2;
const INTERVAL_MS = 3800;

export function StepsCube({ steps }: { steps: Step[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % steps.length);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [steps.length]);

  const current = steps[index] ?? steps[0];
  if (!current) return null;

  return (
    <section className="grid items-center gap-14 border-b border-border py-24 sm:grid-cols-[auto_1fr]">
      <div className="mx-auto" style={{ perspective: 900 }}>
        <div
          className="relative transition-transform duration-700 ease-in-out"
          style={{
            width: SIZE,
            height: SIZE,
            transformStyle: "preserve-3d",
            transform: `rotateX(-16deg) rotateY(${index * -90}deg)`,
          }}
        >
          {steps.map((step, i) => (
            <div
              key={step.label}
              className="paper-panel absolute flex items-center justify-center font-mono text-5xl text-accent"
              style={{
                width: SIZE,
                height: SIZE,
                transform: `rotateY(${FACE_ANGLES[i]}deg) translateZ(${HALF}px)`,
              }}
            >
              {step.label}
            </div>
          ))}
          <div
            className="absolute border border-border-strong bg-secondary"
            style={{ width: SIZE, height: SIZE, transform: `rotateY(-90deg) translateZ(${HALF}px)` }}
          />
          <div
            className="absolute border border-border-strong bg-muted"
            style={{ width: SIZE, height: SIZE, transform: `rotateX(90deg) translateZ(${HALF}px)` }}
          />
          <div
            className="absolute border border-border-strong bg-muted"
            style={{ width: SIZE, height: SIZE, transform: `rotateX(-90deg) translateZ(${HALF}px)` }}
          />
        </div>
      </div>

      <div key={index} className="animate-step-fade">
        <p className="font-mono text-xs text-accent">{current.label}</p>
        <h2 className="mt-4 text-2xl">{current.title}</h2>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">{current.text}</p>
        <div className="mt-6 flex gap-2">
          {steps.map((step, i) => (
            <button
              key={step.label}
              type="button"
              aria-label={`Ver passo ${step.label}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 w-6 rounded-full transition-colors ${
                i === index ? "bg-accent" : "bg-border-strong"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
