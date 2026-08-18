import type { ReactNode } from "react";

/** Sublinhado ondulado desenhado à mão, tipo destaque de caderno sob a palavra. */
export function SketchUnderline({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block">
      {children}
      <svg
        aria-hidden="true"
        viewBox="0 0 100 12"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -bottom-1.5 left-0 h-2 w-full"
      >
        <path
          d="M 1 6 C 15 2, 28 9, 42 5 S 68 2, 82 6 S 96 8, 99 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}

/** Círculo torto desenhado à mão ao redor do texto, tipo destaque de item ativo. */
export function SketchCircle({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block px-3 py-1">
      <svg
        aria-hidden="true"
        viewBox="0 0 100 50"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -inset-x-1 -inset-y-1 h-[calc(100%+0.5rem)] w-[calc(100%+0.5rem)]"
      >
        <path
          d="M 22 4 C 8 6, 2 18, 3 26 C 4 36, 14 45, 32 46 C 55 48, 80 46, 92 40
             C 99 36, 98 22, 93 14 C 87 5, 68 1, 48 2 C 38 2, 28 3, 22 4 Z"
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

/** Linha horizontal ondulada, sangrando ate a borda da tela, separando o header do resto. */
export function SketchDivider() {
  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] h-3 w-screen overflow-hidden">
      <svg
        aria-hidden="true"
        viewBox="0 0 1000 12"
        preserveAspectRatio="none"
        className="h-full w-full text-border-strong"
      >
        <path
          d="M 0 6 C 80 3, 160 9, 240 6 S 400 3, 480 7 S 640 9, 720 5 S 880 3, 1000 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
