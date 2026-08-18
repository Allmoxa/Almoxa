import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const FADE_DISTANCE_PX = 120;

/**
 * Some suavemente assim que a página começa a rolar, volta a aparecer ao
 * retornar ao topo — scrub ligado direto à posição do scroll (via
 * ScrollTrigger, já sincronizado com o Lenis por SmoothScroll), não uma
 * animação de uma vez só.
 */
export function ScrollFade({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const tween = gsap.to(el, {
      opacity: 0,
      ease: "none",
      scrollTrigger: {
        trigger: document.body,
        start: "top top",
        end: `${FADE_DISTANCE_PX} top`,
        scrub: true,
      },
    });

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
