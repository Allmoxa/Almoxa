import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Revela o texto palavra por palavra. A máscara (overflow-hidden) e a posição
 * inicial vêm de CSS (.reveal-word em styles.css), não de JS — assim o texto
 * já nasce escondido no primeiro paint, sem flash antes do GSAP assumir.
 */
export function TextReveal({
  text,
  as: Tag = "span",
  className,
}: {
  text: string;
  as?: React.ElementType;
  className?: string;
}) {
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const words = el.querySelectorAll<HTMLElement>("[data-reveal-word]");

    const tween = gsap.to(words, {
      yPercent: 0,
      opacity: 1,
      duration: 0.4,
      ease: "power2.out",
      stagger: 0.02,
      clearProps: "transform",
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        once: true,
      },
    });

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [text]);

  const words = text.split(" ");

  return (
    <Tag ref={containerRef} className={className}>
      {words.map((word, i) => (
        <span key={i} className="reveal-word-mask">
          <span data-reveal-word className="reveal-word">
            {word}
            {i < words.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </Tag>
  );
}
