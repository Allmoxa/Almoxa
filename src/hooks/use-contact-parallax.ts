import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";

gsap.registerPlugin(ScrollTrigger);

type Amplitude = {
  textX: number;
  textOpacity: number;
  formX: number;
  formY: number;
};

const DESKTOP: Amplitude = { textX: -50, textOpacity: 0.8, formX: 65, formY: 10 };
const TABLET: Amplitude = { textX: -32, textOpacity: 0.8, formX: 42, formY: 7 };
const MOBILE: Amplitude = { textX: -12, textOpacity: 0.88, formX: 14, formY: 6 };

/**
 * contactParallaxTimeline — entrada mais calma que a da seção "Quem fez":
 * o texto entra pela esquerda e o formulário pela direita com uma leve
 * elevação, o formulário começando um pouco depois do texto (overlap de
 * ~0.15 na timeline). scrub mais baixo (0.7) pra não ficar preso ao pixel
 * do scroll.
 */
export function useContactParallax() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const textGroupRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const section = sectionRef.current;
    const textGroup = textGroupRef.current;
    const form = formRef.current;
    if (!section || !textGroup || !form) return;

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();

      const build = (amp: Amplitude) => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: "top 80%",
            end: "top 25%",
            scrub: 0.7,
            invalidateOnRefresh: true,
          },
        });

        tl.fromTo(
          textGroup,
          { x: amp.textX, opacity: amp.textOpacity },
          { x: 0, opacity: 1, ease: "none" },
          0,
        ).fromTo(form, { x: amp.formX, y: amp.formY }, { x: 0, y: 0, ease: "none" }, 0.15);

        return () => {
          tl.scrollTrigger?.kill();
          tl.kill();
        };
      };

      // gsap.matchMedia só chama o callback de um add() quando pelo menos uma
      // das queries daquele add bate — por isso cada cenário (não uma tabela
      // de condições combinadas) precisa do próprio add() com uma query só.
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set([textGroup, form], { clearProps: "transform,opacity" });
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

  return { sectionRef, textGroupRef, formRef };
}
