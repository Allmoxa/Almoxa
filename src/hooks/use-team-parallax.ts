import { useCallback, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";

gsap.registerPlugin(ScrollTrigger);

type Amplitude = {
  titleX: number;
  titleOpacity: number;
  cardX: number;
  cardRotation: number;
  cardTapeX: number;
  tapeXOuter: number;
  tapeXInner: number;
  tapeRotationOuter: number;
  tapeRotationInner: number;
};

const DESKTOP: Amplitude = {
  titleX: -60,
  titleOpacity: 0,
  cardX: 85,
  cardRotation: 1,
  cardTapeX: 6,
  tapeXOuter: 14,
  tapeXInner: 10,
  tapeRotationOuter: 1.2,
  tapeRotationInner: 0.8,
};
const TABLET: Amplitude = {
  titleX: -39,
  titleOpacity: 0,
  cardX: 55,
  cardRotation: 1,
  cardTapeX: 4,
  tapeXOuter: 9,
  tapeXInner: 6.5,
  tapeRotationOuter: 1.2,
  tapeRotationInner: 0.8,
};
const MOBILE: Amplitude = {
  titleX: -12,
  titleOpacity: 0,
  cardX: 14,
  cardRotation: 0.5,
  cardTapeX: 4,
  tapeXOuter: 6,
  tapeXInner: 4,
  tapeRotationOuter: 0.6,
  tapeRotationInner: 0.4,
};

// Ordem das fitas de canto: superior-esquerda, superior-direita,
// inferior-esquerda, inferior-direita.
const CORNER_SIDE = [-1, 1, -1, 1] as const;

/**
 * teamParallaxTimeline — título entra pela esquerda, os dois cards entram
 * por lados opostos com uma leve rotação que se desfaz, e as fitas (cantos
 * + cards) ganham um parallax discreto com profundidades levemente
 * diferentes. Tudo dentro da mesma faixa de scroll (entrada da seção), sem
 * pin — o papelão já "sobe" naturalmente com o scroll comum.
 */
export function useTeamParallax() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const titleGroupRef = useRef<HTMLDivElement | null>(null);
  const card1Ref = useRef<HTMLDivElement | null>(null);
  const card2Ref = useRef<HTMLDivElement | null>(null);
  const card1TapeRef = useRef<HTMLSpanElement | null>(null);
  const card2TapeRef = useRef<HTMLSpanElement | null>(null);
  const cornerTapeRefs = useRef<(HTMLSpanElement | null)[]>([null, null, null, null]);

  const setCornerTapeRef = useCallback(
    (index: number) => (el: HTMLSpanElement | null) => {
      cornerTapeRefs.current[index] = el;
    },
    [],
  );

  useIsomorphicLayoutEffect(() => {
    const section = sectionRef.current;
    const titleGroup = titleGroupRef.current;
    const card1 = card1Ref.current;
    const card2 = card2Ref.current;
    const card1Tape = card1TapeRef.current;
    const card2Tape = card2TapeRef.current;
    const cornerTapes = cornerTapeRefs.current;
    if (!section || !titleGroup || !card1 || !card2 || !card1Tape || !card2Tape) return;
    if (cornerTapes.some((el) => !el)) return;

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      const allEls = [titleGroup, card1, card2, card1Tape, card2Tape, ...cornerTapes];

      const build = (amp: Amplitude) => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: "top 80%",
            end: "top 20%",
            scrub: 1,
            invalidateOnRefresh: true,
          },
        });

        tl.fromTo(
          titleGroup,
          { x: amp.titleX, opacity: amp.titleOpacity },
          { x: 0, opacity: 1, ease: "none" },
          0,
        )
          .fromTo(
            card1,
            { x: -amp.cardX, rotation: -amp.cardRotation, opacity: 0 },
            { x: 0, rotation: 0, opacity: 1, ease: "none" },
            0.1,
          )
          .fromTo(
            card2,
            { x: amp.cardX, rotation: amp.cardRotation, opacity: 0 },
            { x: 0, rotation: 0, opacity: 1, ease: "none" },
            0.18,
          )
          .fromTo(card1Tape, { x: -amp.cardTapeX }, { x: 0, ease: "none" }, 0.13)
          .fromTo(card2Tape, { x: amp.cardTapeX }, { x: 0, ease: "none" }, 0.21);

        cornerTapes.forEach((tape, i) => {
          if (!tape) return;
          const side = CORNER_SIDE[i] ?? 1;
          const amplitude = i < 2 ? amp.tapeXInner : amp.tapeXOuter;
          const rotation = i < 2 ? amp.tapeRotationInner : amp.tapeRotationOuter;
          tl.fromTo(
            tape,
            { x: side * amplitude, rotation: side * rotation },
            { x: 0, rotation: 0, ease: "none" },
            i < 2 ? 0 : 0.05,
          );
        });

        return () => {
          tl.scrollTrigger?.kill();
          tl.kill();
        };
      };

      // gsap.matchMedia só chama o callback de um add() quando pelo menos uma
      // das queries daquele add bate — por isso cada cenário (não uma tabela
      // de condições combinadas) precisa do próprio add() com uma query só.
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(allEls, { clearProps: "transform,opacity" });
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

  return {
    sectionRef,
    titleGroupRef,
    card1Ref,
    card2Ref,
    card1TapeRef,
    card2TapeRef,
    setCornerTapeRef,
  };
}
