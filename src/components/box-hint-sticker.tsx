const POST_IT_BG = "#F3D667";
const INK = "#3B2A18";

/**
 * Post-it colado à direita da caixa do hero, com uma seta desenhada à mão
 * apontando de volta pra ela. Só cabe com folga a partir de xl -- em telas
 * menores a coluna da caixa fica curta demais e ele bateria na borda.
 */
export function BoxHintSticker() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-full z-30 hidden -translate-y-1/2 items-center pl-1 xl:flex"
    >
      <svg width="56" height="34" viewBox="0 0 56 34" fill="none" aria-hidden="true">
        <path d="M52 6 C 34 3, 16 10, 5 19" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        <path
          d="M5 19 L 13.5 15.5 M5 19 L 11 25.5"
          stroke={INK}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>

      <div
        className="-rotate-3 rounded-[2px] px-4 py-3 shadow-[0_12px_24px_-10px_rgba(0,0,0,0.4)]"
        style={{ backgroundColor: POST_IT_BG, width: 128 }}
      >
        <p className="font-display text-[15px] leading-snug" style={{ color: INK }}>
          a caixa <span className="font-semibold">GIRA</span>
        </p>
      </div>
    </div>
  );
}
