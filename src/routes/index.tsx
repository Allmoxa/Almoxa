import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { CardboardLiquidButton } from "@/components/cardboard-liquid-button";
import { MagneticNavItem } from "@/components/magnetic-nav-item";
import { SiteGate } from "@/components/site-gate";
import { SketchDivider } from "@/components/sketch";
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
  component: () => (
    <SiteGate>
      <Landing />
    </SiteGate>
  ),
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

      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <ScrollFade className="font-logo text-3xl font-semibold">
          <LogoRefreshButton />
        </ScrollFade>

        <nav className="hidden items-center gap-9 text-base md:flex">
          <MagneticNavItem href="#inicio" shape="circle" alwaysDrawn labelClassName="font-medium">
            Início
          </MagneticNavItem>
          <span className="text-border-strong" aria-hidden="true">
            |
          </span>
          <MagneticNavItem href="#como-funciona" shape="underline">
            Como funciona
          </MagneticNavItem>
          <span className="text-border-strong" aria-hidden="true">
            |
          </span>
          <MagneticNavItem href="#quem-fez" shape="underline">
            Quem fez
          </MagneticNavItem>
          <span className="text-border-strong" aria-hidden="true">
            |
          </span>
          <MagneticNavItem href="#contato" shape="underline">
            Contato
          </MagneticNavItem>
        </nav>

        <div className="flex items-center gap-10">
          <MagneticNavItem
            to="/criar-conta"
            shape="brackets"
            labelClassName="text-lg font-semibold"
          >
            Criar conta
          </MagneticNavItem>
          <MagneticNavItem to="/auth" shape="brackets" labelClassName="text-lg font-semibold">
            Entrar
          </MagneticNavItem>
        </div>
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
            <h1 className="mt-6 max-w-2xl text-4xl leading-[1.05] sm:text-6xl sm:leading-[1.02] lg:text-7xl">
              Seu estoque atualizado com uma foto.
            </h1>
            <p className="mt-6 max-w-xl text-base text-muted-foreground">
              Nada de planilha. Fotografe o produto ou importe o documento da compra: nome, código,
              quantidade e preços entram sozinhos — e o lucro de cada item aparece calculado.
            </p>
            {/* Some no celular: a navbar já tem "Criar conta"/"Entrar" em qualquer
                tamanho de tela, então os círculos aqui ficam só a partir do sm:,
                onde há espaço de sobra pra eles brilharem sem competir com nada. */}
            <div className="hidden sm:flex sm:items-center sm:gap-14">
              <CardboardLiquidButton to="/criar-conta" ariaLabel="Criar conta">
                Criar conta
              </CardboardLiquidButton>
              <CardboardLiquidButton to="/auth" ariaLabel="Entrar na conta">
                Entrar na conta
              </CardboardLiquidButton>
            </div>
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
