import { useEffect, useLayoutEffect } from "react";

/**
 * useLayoutEffect é o que os hooks de parallax querem (monta o estado
 * inicial do GSAP antes do paint, sem flash) — mas TanStack Start
 * renderiza esses componentes no servidor também, e useLayoutEffect nunca
 * roda lá, o que vira warning no console. Resolve pra useEffect no
 * servidor (onde nenhum dos dois roda de verdade) e useLayoutEffect no
 * navegador.
 */
export const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
