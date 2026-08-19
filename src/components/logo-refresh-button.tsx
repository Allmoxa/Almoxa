import { useEffect, useRef, useState, type CSSProperties } from "react";

const PATHS = [
  "M 4 6 L 2 34 L 3 62 L 2 88",
  "M 96 8 L 97 36 L 95 64 L 96 82",
  "M 2 88 C 16 92, 27 85, 40 88 S 63 91, 76 87 S 90 84, 96 82",
] as const;

const PRESS_DURATION_MS = 150;

/**
 * Logo da home como botão de refresh — mesmo colchete desenhado à mão do
 * LogoBracket, mas clicável e com o contorno "redesenhado" no hover via
 * stroke-dasharray/dashoffset. Cada traço aprende o próprio comprimento com
 * getTotalLength() e anima de invisível até sólido em ~500ms; sem esse
 * valor (antes da hidratação) o traço renderiza sólido normalmente, então
 * não há flash de estado errado.
 */
export function LogoRefreshButton() {
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const [lengths, setLengths] = useState<(number | null)[]>([null, null, null]);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    setLengths(pathRefs.current.map((el) => el?.getTotalLength() ?? null));
  }, []);

  const handleClick = () => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      window.location.reload();
      return;
    }
    setPressed(true);
    window.setTimeout(() => window.location.reload(), PRESS_DURATION_MS);
  };

  return (
    <button
      type="button"
      aria-label="Atualizar página"
      onClick={handleClick}
      data-pressed={pressed || undefined}
      className="logo-refresh-button -m-2 inline-flex cursor-pointer border-0 bg-transparent p-2"
    >
      <span className="logo-refresh-visual relative inline-block px-3 py-1.5">
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute -inset-x-1 -inset-y-1 h-[calc(100%+0.5rem)] w-[calc(100%+0.5rem)]"
        >
          {PATHS.map((d, i) => (
            <path
              key={d}
              ref={(el) => {
                pathRefs.current[i] = el;
              }}
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="logo-refresh-path"
              style={
                lengths[i] != null
                  ? ({ "--path-length": lengths[i] } as CSSProperties)
                  : undefined
              }
            />
          ))}
        </svg>
        <span className="logo-refresh-text relative">Almoxá</span>
      </span>
    </button>
  );
}
