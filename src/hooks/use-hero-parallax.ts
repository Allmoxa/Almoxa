import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";

gsap.registerPlugin(ScrollTrigger);

type Amplitude = {
  textX: number;
  textOpacity: number;
  boxX: number;
  boxY: number;
  rotation: number;
};

const DESKTOP: Amplitude = { textX: -50, textOpacity: 0.85, boxX: 60, boxY: -10, rotation: 0.4 };
const TABLET: Amplitude = { textX: -33, textOpacity: 0.85, boxX: 39, boxY: -10, rotation: 0.4 };
const MOBILE: Amplitude = { textX: -12, textOpacity: 0.9, boxX: 14, boxY: -6, rotation: 0.3 };

/**
 * heroParallaxTimeline — nos primeiros 60% da altura do hero, o grupo de
 * texto desliza discretamente pra esquerda enquanto a caixa desliza pra
 * direita (com leve subida e rotação quase imperceptível), como se
 * estivessem se afastando. scrub liga isso direto à posição do scroll, o
 * que já torna o movimento reversível ao subir a página — não é uma
 * timeline "once".
 */
export function useHeroParallax() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const textGroupRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const section = sectionRef.current;
    const textGroup = textGroupRef.current;
    const box = boxRef.current;
    if (!section || !textGroup || !box) return;

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();

      const build = (amp: Amplitude) => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: () => `+=${section.offsetHeight * 0.6}`,
            scrub: 0.8,
            invalidateOnRefresh: true,
          },
        });

        tl.to(textGroup, { x: amp.textX, opacity: amp.textOpacity, ease: "none" }, 0).to(
          box,
          { x: amp.boxX, y: amp.boxY, rotation: amp.rotation, ease: "none" },
          0,
        );

        return () => {
          tl.scrollTrigger?.kill();
          tl.kill();
        };
      };

      // gsap.matchMedia só chama o callback de um add() quando pelo menos uma
      // das queries daquele add bate — por isso cada cenário (não uma tabela
      // de condições combinadas) precisa do próprio add() com uma query só.
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set([textGroup, box], { clearProps: "transform,opacity" });
      });
      mm.add("(prefers-reduced-motion: no-preference) and (min-width: 1025px)", () => build(DESKTOP));
      mm.add(
        "(prefers-reduced-motion: no-preference) and (min-width: 768px) and (max-width: 1024px)",
        () => build(TABLET),
      );
      mm.add("(prefers-reduced-motion: no-preference) and (max-width: 767px)", () => build(MOBILE));
    }, section);

    return () => ctx.revert();
  }, []);

  return { sectionRef, textGroupRef, boxRef };
}
