import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

const SESSION_KEY = "almoxa-tape-intro-played";
const VIDEO_URL = "/videos/tape-gun.mp4";
const RENDER_SIZE = 640;
// Rampa linear pelo canal mais escuro do pixel (medida no vídeo real: fundo
// concentrado em ~240-255, sujeito espalhado de 0-220). Abaixo de
// OPAQUE_BELOW fica 100% visível, acima de TRANSPARENT_AT fica 100%
// transparente, e entre os dois interpola — isso evita uma borda serrilhada
// ao redor do aplicador e da fita.
const OPAQUE_BELOW = 215;
const TRANSPARENT_AT = 238;
const HOLD_BEFORE_FADE = 1;
const FADE_DURATION = 0.9;

/**
 * Recorta o fundo branco do vídeo em tempo real, pixel a pixel, direto no
 * canvas — sem precisar de um arquivo com canal alpha nem de um passo
 * externo de remoção de fundo. O vídeo foi gerado com fundo branco puro
 * exatamente para isso funcionar.
 */
function keyOutWhite(ctx: CanvasRenderingContext2D, size: number) {
  const frame = ctx.getImageData(0, 0, size, size);
  const data = frame.data;
  const range = TRANSPARENT_AT - OPAQUE_BELOW;
  for (let i = 0; i < data.length; i += 4) {
    const darkest = Math.min(data[i]!, data[i + 1]!, data[i + 2]!);
    if (darkest >= TRANSPARENT_AT) {
      data[i + 3] = 0;
    } else if (darkest > OPAQUE_BELOW) {
      data[i + 3] = Math.round(255 * (1 - (darkest - OPAQUE_BELOW) / range));
    }
  }
  ctx.putImageData(frame, 0, 0);
}

export function TapeVideoIntro() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [play, setPlay] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, "1");
    setPlay(true);
  }, []);

  useEffect(() => {
    if (!play) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = RENDER_SIZE;
    canvas.height = RENDER_SIZE;

    const video = document.createElement("video");
    video.src = VIDEO_URL;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    let disposed = false;
    let rafId = 0;
    let done = false;

    const drawLoop = () => {
      if (disposed) return;
      ctx.drawImage(video, 0, 0, RENDER_SIZE, RENDER_SIZE);
      keyOutWhite(ctx, RENDER_SIZE);
      if (!video.paused && !video.ended) {
        rafId = requestAnimationFrame(drawLoop);
      }
    };

    const finish = () => {
      if (done) return;
      done = true;
      gsap.to(container, {
        opacity: 0,
        duration: FADE_DURATION,
        delay: HOLD_BEFORE_FADE,
        onComplete: () => setPlay(false),
      });
    };

    const onCanPlay = () => {
      gsap.set(container, { opacity: 1 });
      video.play().catch(finish);
      rafId = requestAnimationFrame(drawLoop);
    };

    video.addEventListener("canplaythrough", onCanPlay, { once: true });
    video.addEventListener("ended", finish);
    video.addEventListener("error", finish);
    video.load();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.removeEventListener("canplaythrough", onCanPlay);
      video.removeEventListener("ended", finish);
      video.removeEventListener("error", finish);
    };
  }, [play]);

  if (!play) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[15] overflow-hidden opacity-0"
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute -right-[6vw] -top-[8vh] aspect-square w-[min(80vw,88vh)] max-w-none sm:-right-[2vw] sm:-top-[4vh] sm:w-[min(50vw,78vh)]"
      />
    </div>
  );
}
