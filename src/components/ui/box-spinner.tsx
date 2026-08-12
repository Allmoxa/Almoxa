import { cn } from "@/lib/utils";

const CARDBOARD = "#C19A6C";

const FACES = [
  { transform: "rotateY(0deg)", tone: CARDBOARD },
  { transform: "rotateY(90deg)", tone: "#A9825A" },
  { transform: "rotateY(180deg)", tone: CARDBOARD },
  { transform: "rotateY(-90deg)", tone: "#A9825A" },
  { transform: "rotateX(90deg)", tone: "#D4B285" },
  { transform: "rotateX(-90deg)", tone: "#8F6E4A" },
];

export function BoxSpinner({ size = 36, className }: { size?: number; className?: string }) {
  const half = size / 2;

  return (
    <span
      role="status"
      aria-label="Carregando"
      className={cn("inline-block align-middle", className)}
      style={{ width: size, height: size, perspective: size * 5 }}
    >
      <span
        className="relative block h-full w-full animate-box-spin"
        style={{ transformStyle: "preserve-3d" }}
      >
        {FACES.map((face, i) => (
          <span
            key={i}
            className="absolute border-2 border-primary/70 shadow-sm"
            style={{
              width: size,
              height: size,
              backgroundColor: face.tone,
              transform: `${face.transform} translateZ(${half}px)`,
            }}
          />
        ))}
      </span>
    </span>
  );
}
