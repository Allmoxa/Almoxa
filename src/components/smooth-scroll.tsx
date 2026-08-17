import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

/**
 * Lenis conduz o scroll real e alimenta o ticker do GSAP, para que o
 * ScrollTrigger fique sincronizado com a rolagem suavizada em vez de
 * reagir ao scroll nativo (que Lenis já interceptou).
 */
export function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({ autoRaf: false });
    const onTick = (time: number) => lenis.raf(time * 1000);

    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(onTick);
    gsap.ticker.lagSmoothing(0);

    // Lenis muda como o scroll se comporta assim que monta; os triggers já
    // registrados por outros componentes podem ter medido posições antes
    // disso. Um refresh depois de estabilizar garante que estejam corretos.
    const refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 200);
    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    return () => {
      window.clearTimeout(refreshTimer);
      gsap.ticker.remove(onTick);
      lenis.destroy();
    };
  }, []);

  return null;
}
