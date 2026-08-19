import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StepsCube } from "@/components/steps-cube";
import { SmoothScroll } from "@/components/smooth-scroll";
import { AosInit } from "@/components/aos-init";
import { DevelopersSection } from "@/components/developers-section";
import { RevealSafetyNet } from "@/components/reveal-safety-net";
import { ContactForm } from "@/components/contact-form";
import { ScrollFade } from "@/components/scroll-fade";
import { LogoRefreshButton } from "@/components/logo-refresh-button";
import { MagneticLink } from "@/components/magnetic-button";
import { SpinCursor } from "@/components/spin-cursor";
import { SketchUnderline, SketchCircle, SketchDivider } from "@/components/sketch";
import { useHeroParallax } from "@/hooks/use-hero-parallax";
import { useFooterLineReveal } from "@/hooks/use-footer-line-reveal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Almoxá — estoque por foto ou nota de compra" },
      {
        name: "description",
        content:
          "Controle entrada e saída de produtos sem digitar: fotografe o item ou importe a nota de compra e o estoque se preenche.",
      },
      { property: "og:title", content: "Almoxá — estoque por foto ou nota de compra" },
      {
        property: "og:description",
        content:
          "Controle entrada e saída de produtos sem digitar: fotografe o item ou importe a nota de compra e o estoque se preenche.",
      },
    ],
  }),
  component: Landing,
});

const steps = [
  {
    label: "01",
    title: "Fotografe",
    text: "Aponte a câmera para o produto ou a etiqueta. A leitura identifica nome, código e quantidade.",
  },
  {
    label: "02",
    title: "Ou importe a nota",
    text: "Envie a nota fiscal, o pedido ou o recibo em PDF. Todos os itens da compra entram juntos.",
  },
  {
    label: "03",
    title: "Confira e confirme",
    text: "Ajuste preço de compra e de venda se quiser. O estoque e o lucro se atualizam na hora.",
  },
];

function Landing() {
  const navigate = useNavigate();
  const {
    sectionRef: heroSectionRef,
    textGroupRef: heroTextGroupRef,
    boxRef: heroBoxRef,
  } = useHeroParallax();
  const { footerRef, lineRef: footerLineRef } = useFooterLineReveal();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/estoque" });
    });
  }, [navigate]);

  return (
    <div id="inicio" className="paper-texture-bg min-h-screen overflow-x-clip bg-background">
      <SmoothScroll />
      <AosInit />
      <RevealSafetyNet />
      <SpinCursor />

      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <ScrollFade className="font-logo text-3xl font-semibold">
          <LogoRefreshButton />
        </ScrollFade>

        <nav className="hidden items-center gap-5 text-base md:flex">
          <a href="#inicio" className="font-medium text-foreground">
            <SketchCircle>Início</SketchCircle>
          </a>
          <span className="text-border-strong" aria-hidden="true">
            |
          </span>
          <a href="#como-funciona" className="text-foreground transition-opacity hover:opacity-70">
            <SketchUnderline>Como funciona</SketchUnderline>
          </a>
          <span className="text-border-strong" aria-hidden="true">
            |
          </span>
          <a href="#quem-fez" className="text-foreground transition-opacity hover:opacity-70">
            <SketchUnderline>Quem fez</SketchUnderline>
          </a>
          <span className="text-border-strong" aria-hidden="true">
            |
          </span>
          <a href="#contato" className="text-foreground transition-opacity hover:opacity-70">
            <SketchUnderline>Contato</SketchUnderline>
          </a>
        </nav>

        <Link
          to="/auth"
          className="text-lg font-semibold text-foreground transition-opacity hover:opacity-70"
        >
          Entrar
        </Link>
      </header>

      <SketchDivider />

      <main className="mx-auto max-w-5xl px-6">
        <section
          ref={heroSectionRef}
          id="como-funciona"
          className="grid items-center gap-12 border-b border-border py-24 lg:grid-cols-[1fr_auto]"
        >
          <div ref={heroTextGroupRef} style={{ willChange: "transform" }}>
            <p className="label-caps">Controle de entrada e saída</p>
            <h1 className="mt-6 max-w-2xl text-6xl leading-[1.02] sm:text-7xl">
              Seu estoque atualizado com uma foto.
            </h1>
            <p className="mt-6 max-w-xl text-base text-muted-foreground">
              Nada de planilha. Fotografe o produto ou importe o documento da compra: nome, código,
              quantidade e preços entram sozinhos — e o lucro de cada item aparece calculado.
            </p>
            <MagneticLink
              to="/auth"
              className="mt-10 inline-flex rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Entrar na conta
            </MagneticLink>
          </div>

          <div ref={heroBoxRef} style={{ willChange: "transform" }}>
            <StepsCube steps={steps} />
          </div>
        </section>

        <DevelopersSection />

        <ContactForm />

        <footer
          ref={footerRef}
          className="relative py-10 text-sm text-muted-foreground"
          data-aos="fade-up"
        >
          <span
            ref={footerLineRef}
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-px bg-border"
            style={{ transformOrigin: "center", willChange: "transform" }}
          />
          Almoxá — controle de estoque simples para quem compra e revende.
        </footer>
      </main>
    </div>
  );
}
