import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

const TAPE_THICKNESS = 46;
const DURATION = 3;

function TapeDispenserIcon() {
  return (
    <svg width="60" height="42" viewBox="0 0 60 42" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 30 2 40 15 33Z" fill="#2A1E12" />
      <rect x="3" y="17" width="27" height="15" rx="3" fill="#2A1E12" />
      <circle cx="39" cy="20" r="19" fill="#2A1E12" />
      <circle cx="39" cy="20" r="13" fill="#D8B78C" />
      <circle cx="39" cy="20" r="12" fill="none" stroke="#EFE3CB" strokeWidth="2" opacity="0.6" />
      <circle cx="39" cy="20" r="5" fill="#2A1E12" />
    </svg>
  );
}

/**
 * Fita de embalagem cruzando a tela na diagonal, uma vez, ao carregar a home.
 * Some atrás da caixa (StepsCube) e do texto do hero por z-index: eles ficam
 * numa camada acima (z-20), a fita fica numa camada abaixo (z-15) — nenhuma
 * das duas precisa saber da outra, o navegador resolve a ordem sozinho.
 */
export function TapeIntro() {
  const containerRef = useRef<HTMLDivElement>(null);
  const tapeRef = useRef<HTMLDivElement>(null);
  const dispenserRef = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setPlay(true);
  }, []);

  useEffect(() => {
    if (!play) return;
    const tape = tapeRef.current;
    const dispenser = dispenserRef.current;
    const container = containerRef.current;
    if (!tape || !dispenser || !container) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const narrow = vw < 640;
    const angleDeg = narrow ? -58 : -34;
    const angleRad = (angleDeg * Math.PI) / 180;

    const length = Math.hypot(vw, vh) * 1.35;
    const dx = (Math.cos(angleRad) * length) / 2;
    const dy = (Math.sin(angleRad) * length) / 2;
    const center = { x: vw / 2, y: vh / 2 };
    // Ponta direita da tira (antes de girar) vira o canto superior direito
    // depois do rotate negativo — é onde o aplicador começa.
    const start = { x: center.x + dx, y: center.y + dy };
    const end = { x: center.x - dx, y: center.y - dy };

    gsap.set(tape, {
      width: length,
      height: TAPE_THICKNESS,
      left: center.x,
      top: center.y,
      xPercent: -50,
      yPercent: -50,
      rotate: angleDeg,
      clipPath: "inset(0 0 0 100%)",
    });
    gsap.set(dispenser, {
      x: start.x,
      y: start.y,
      rotate: angleDeg + 90,
    });
    gsap.set(container, { opacity: 1 });

    const tl = gsap.timeline({
      defaults: { duration: DURATION, ease: "power2.inOut" },
      onComplete: () => {
        gsap.to(container, {
          opacity: 0,
          duration: 0.6,
          delay: 0.35,
          onComplete: () => setPlay(false),
        });
      },
    });

    tl.to(tape, { clipPath: "inset(0 0 0 0%)" }, 0);
    tl.to(dispenser, { x: end.x, y: end.y }, 0);

    return () => {
      tl.kill();
    };
  }, [play]);

  if (!play) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[15] overflow-hidden opacity-0"
    >
      <div
        ref={tapeRef}
        className="absolute"
        style={{
          background: `linear-gradient(180deg,
              rgba(193, 154, 108, 0) 0%,
              rgba(216, 183, 140, 0.5) 14%,
              rgba(239, 227, 203, 0.72) 50%,
              rgba(216, 183, 140, 0.5) 86%,
              rgba(193, 154, 108, 0) 100%
            ),
            repeating-linear-gradient(
              98deg,
              rgba(255, 255, 255, 0.22) 0px,
              rgba(255, 255, 255, 0.22) 2px,
              transparent 2px,
              transparent 16px
            )`,
          boxShadow: "0 8px 18px -8px rgba(59, 42, 24, 0.4)",
        }}
      />
      <div ref={dispenserRef} className="absolute -ml-3 -mt-5">
        <TapeDispenserIcon />
      </div>
    </div>
  );
}
