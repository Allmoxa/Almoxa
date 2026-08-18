import type { ReactNode } from "react";

/**
 * Colchete desenhado à mão ao redor do texto — duas hastes verticais meio
 * tortas + uma linha ondulada embaixo, tipo destaque de caderno. O SVG usa
 * viewBox percentual (preserveAspectRatio="none") pra esticar junto com a
 * largura real do texto, e non-scaling-stroke pra o traço não engordar.
 */
export function LogoBracket({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block px-3 py-1.5">
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -inset-x-1 -inset-y-1 h-[calc(100%+0.5rem)] w-[calc(100%+0.5rem)]"
      >
        <path
          d="M 4 6 L 2 34 L 3 62 L 2 88"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M 96 8 L 97 36 L 95 64 L 96 82"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M 2 88 C 16 92, 27 85, 40 88 S 63 91, 76 87 S 90 84, 96 82"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}
