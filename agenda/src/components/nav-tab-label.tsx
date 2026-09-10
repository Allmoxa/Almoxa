import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";

/**
 * Quatro cantos tortos, cada um seu próprio <path>, framing a aba. Local
 * viewBox de 24x24 por canto (não um SVG só esticado) pra o traço não
 * engordar/afinar quando a aba é mais larga ("Movimentações" vs "Vender") —
 * cada canto vive no seu próprio quadradinho de tamanho fixo.
 */
const CORNERS = [
  {
    key: "tl",
    pos: "-top-1 -left-1",
    peek: true,
    d: "M 14.5 3.2 C 9.2 2.4 5.3 2.7 3.4 4.3 C 2.3 7.2 2.1 11.6 2.7 15.4",
  },
  {
    key: "tr",
    pos: "-top-1 -right-1",
    peek: false,
    d: "M 9.3 2.6 C 14.5 1.9 18.6 2.3 20.6 4 C 21.7 7 21.9 11.4 21.4 15.2",
  },
  {
    key: "br",
    pos: "-bottom-1 -right-1",
    peek: true,
    d: "M 21.3 8.6 C 21.9 12.2 21.7 16.2 20.4 18.7 C 18.4 20.4 14.3 20.8 9.7 20.3",
  },
  {
    key: "bl",
    pos: "-bottom-1 -left-1",
    peek: false,
    d: "M 2.7 8.9 C 2.2 12.4 2.4 16.3 3.6 18.8 C 5.5 20.5 9.5 20.9 14.2 20.4",
  },
] as const;

const STROKE_DURATION = 0.105;
const STROKE_GAP = "+=0.035";
const EXIT_DURATION = 0.15;

/**
 * Rótulo de uma aba da navbar + o contorno artesanal que desenha nos quatro
 * cantos quando ela vira a rota atual. `active` vem do isActive do próprio
 * Link (raiz na URL, não em estado local) — então sobrevive a reload e nunca
 * fica dessincronizado da rota.
 */
export function NavTabLabel({ active, children }: { active: boolean; children: ReactNode }) {
  const pathRefs = useRef<Array<SVGPathElement | null>>([]);
  const lengthsRef = useRef<number[]>([]);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const wasActive = useRef(false);

  // Mede o comprimento real de cada traço uma vez (bezier != distância reta)
  // e planta o estado "oculto" via --corner-length, sem flash: opacity 0 no
  // CSS já esconde tudo antes deste efeito rodar.
  useEffect(() => {
    const paths = pathRefs.current.filter((p): p is SVGPathElement => p !== null);
    lengthsRef.current = paths.map((path) => path.getTotalLength());
    paths.forEach((path, i) => {
      path.style.setProperty("--corner-length", `${lengthsRef.current[i]}`);
    });
  }, []);

  useEffect(() => {
    const paths = pathRefs.current.filter((p): p is SVGPathElement => p !== null);
    if (paths.length === 0 || lengthsRef.current.length === 0) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    gsap.killTweensOf(paths);
    if (labelRef.current) gsap.killTweensOf(labelRef.current);

    if (prefersReducedMotion) {
      paths.forEach((path, i) => {
        if (active) {
          path.style.opacity = "1";
          path.style.strokeDashoffset = "0";
        } else {
          path.style.removeProperty("opacity");
          path.style.strokeDashoffset = `${lengthsRef.current[i] ?? 24}`;
        }
      });
      wasActive.current = active;
      return;
    }

    if (active) {
      gsap.set(paths, { opacity: 1 });
      const tl = gsap.timeline();
      paths.forEach((path, i) => {
        tl.fromTo(
          path,
          { strokeDashoffset: lengthsRef.current[i] ?? 24 },
          { strokeDashoffset: 0, duration: STROKE_DURATION, ease: "power1.out" },
          i === 0 ? 0 : STROKE_GAP,
        );
      });
      if (labelRef.current) {
        tl.fromTo(
          labelRef.current,
          { y: 0.6, rotate: -0.15 },
          { y: 0, rotate: 0, duration: 0.5, ease: "power1.out" },
          0,
        );
      }
    } else if (wasActive.current) {
      gsap.to(paths, {
        strokeDashoffset: (i) => lengthsRef.current[i] ?? 24,
        duration: EXIT_DURATION,
        ease: "power1.in",
        onComplete: () => gsap.set(paths, { clearProps: "opacity,strokeDashoffset" }),
      });
    }

    wasActive.current = active;
  }, [active]);

  return (
    <>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible">
        {CORNERS.map((corner, i) => (
          <svg
            key={corner.key}
            aria-hidden="true"
            viewBox="0 0 24 24"
            className={`absolute size-4 lg:size-[22px] ${corner.pos}`}
          >
            <path
              ref={(el) => {
                pathRefs.current[i] = el;
              }}
              d={corner.d}
              data-peek={corner.peek ? "true" : undefined}
              className="nav-tab-corner"
            />
          </svg>
        ))}
      </span>
      <span ref={labelRef} className="relative inline-block">
        {children}
      </span>
    </>
  );
}
