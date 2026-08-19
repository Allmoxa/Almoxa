import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";

gsap.registerPlugin(ScrollTrigger);

/**
 * A linha do rodapé cresce do centro pras duas pontas (scaleX, transform-
 * origin: center) nos últimos momentos da rolagem, em vez de já aparecer
 * pronta como um border-top estático.
 */
export function useFooterLineReveal() {
  const footerRef = useRef<HTMLElement | null>(null);
  const lineRef = useRef<HTMLSpanElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const footer = footerRef.current;
    const line = lineRef.current;
    if (!footer || !line) return;

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(line, { clearProps: "transform" });
      });

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tween = gsap.fromTo(
          line,
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: "none",
            scrollTrigger: {
              trigger: footer,
              start: "top 95%",
              end: "top 55%",
              scrub: 0.6,
              invalidateOnRefresh: true,
            },
          },
        );

        return () => {
          tween.scrollTrigger?.kill();
          tween.kill();
        };
      });
    }, footer);

    return () => ctx.revert();
  }, []);

  return { footerRef, lineRef };
}
