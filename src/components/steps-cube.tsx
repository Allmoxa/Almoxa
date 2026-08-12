import { useEffect, useState } from "react";

type Step = {
  label: string;
  title: string;
  text: string;
};

const FACE_ANGLES = [0, 90, 180] as const;
const SIZE = 340;
const HALF = SIZE / 2;
const INTERVAL_MS = 4200;
const CARDBOARD = "#C19A6C";

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
      <div className="mx-auto" style={{ perspective: 1400, width: SIZE, height: SIZE }}>
        <div
          className="relative transition-transform duration-700 ease-in-out"
          style={{
            width: SIZE,
            height: SIZE,
            transformStyle: "preserve-3d",
            transform: `rotateY(${index * -90}deg)`,
          }}
        >
          {steps.map((step, i) => (
            <article
              key={step.label}
              className="paper-panel absolute flex flex-col justify-center gap-4 border-t-4 px-10"
              style={{
                width: SIZE,
                height: SIZE,
                borderTopColor: CARDBOARD,
                transform: `rotateY(${FACE_ANGLES[i]}deg) translateZ(${HALF}px)`,
              }}
            >
              <p className="font-mono text-xs" style={{ color: CARDBOARD }}>
                {step.label}
              </p>
              <h2 className="text-3xl">{step.title}</h2>
              <p className="max-w-sm text-sm text-muted-foreground">{step.text}</p>
            </article>
          ))}
          <div
            className="absolute border"
            style={{
              width: SIZE,
              height: SIZE,
              backgroundColor: "#A9825A",
              borderColor: CARDBOARD,
              transform: `rotateY(-90deg) translateZ(${HALF}px)`,
            }}
          />
          <div
            className="absolute border"
            style={{
              width: SIZE,
              height: SIZE,
              backgroundColor: "#D4B285",
              borderColor: CARDBOARD,
              transform: `rotateX(90deg) translateZ(${HALF}px)`,
            }}
          />
          <div
            className="absolute border"
            style={{
              width: SIZE,
              height: SIZE,
              backgroundColor: "#8F6E4A",
              borderColor: CARDBOARD,
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
