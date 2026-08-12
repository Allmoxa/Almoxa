import { cn } from "@/lib/utils";

const FACES = [
  "rotateY(0deg)",
  "rotateY(90deg)",
  "rotateY(180deg)",
  "rotateY(-90deg)",
  "rotateX(90deg)",
  "rotateX(-90deg)",
];

export function BoxSpinner({ size = 22, className }: { size?: number; className?: string }) {
  const half = size / 2;

  return (
    <span
      role="status"
      aria-label="Carregando"
      className={cn("inline-block align-middle", className)}
      style={{ width: size, height: size, perspective: size * 6 }}
    >
      <span
        className="relative block h-full w-full animate-box-spin"
        style={{ transformStyle: "preserve-3d" }}
      >
        {FACES.map((face, i) => (
          <span
            key={i}
            className="absolute border border-primary/60 bg-accent/25"
            style={{
              width: size,
              height: size,
              transform: `${face} translateZ(${half}px)`,
            }}
          />
        ))}
      </span>
    </span>
  );
}
