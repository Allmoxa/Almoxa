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
