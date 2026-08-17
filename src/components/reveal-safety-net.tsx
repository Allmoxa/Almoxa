import { useEffect } from "react";

/**
 * GSAP, AOS e Framer Motion escondem conteúdo até a animação de entrada
 * disparar. Se ela nunca disparar por qualquer motivo — aba em segundo
 * plano pausando o rAF, fonte carregando e mudando o layout no meio do
 * cálculo do trigger, script bloqueado — o conteúdo não pode ficar
 * invisível para sempre. Depois de um tempo generoso (as animações normais
 * terminam bem antes disso), força a exibição de qualquer coisa que ainda
 * esteja escondida.
 */
export function RevealSafetyNet() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      document.querySelectorAll<HTMLElement>("[data-aos]").forEach((el) => {
        // Uma transição CSS "presa" no meio (ex.: aba em segundo plano pausando
        // o compositor) tem prioridade maior que !important normal — cancelar
        // a animação antes é o que garante que o estilo forçado realmente vale.
        el.getAnimations().forEach((anim) => anim.cancel());
        el.style.setProperty("transition", "none", "important");
        el.style.setProperty("opacity", "1", "important");
        el.style.setProperty("transform", "none", "important");
      });
    }, 2500);

    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
