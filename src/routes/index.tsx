import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StepsCube } from "@/components/steps-cube";
import { SmoothScroll } from "@/components/smooth-scroll";
import { AosInit } from "@/components/aos-init";
import { DevelopersSection } from "@/components/developers-section";
import { RevealSafetyNet } from "@/components/reveal-safety-net";
import { ContactForm } from "@/components/contact-form";

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/estoque" });
    });
  }, [navigate]);

  return (
    <div className="paper-texture-bg min-h-screen overflow-x-hidden bg-background">
      <SmoothScroll />
      <AosInit />
      <RevealSafetyNet />

      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-display text-xl">Almoxá</span>
        <Link
          to="/auth"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Entrar
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="grid items-center gap-12 border-b border-border py-24 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="label-caps" data-aos="fade-up">
              Controle de entrada e saída
            </p>
            <h1 className="mt-6 max-w-2xl text-6xl leading-[1.02] sm:text-7xl">
              Seu estoque atualizado com uma foto.
            </h1>
            <p
              className="mt-6 max-w-xl text-base text-muted-foreground"
              data-aos="fade-up"
              data-aos-delay="100"
            >
              Nada de planilha. Fotografe o produto ou importe o documento da compra: nome, código,
              quantidade e preços entram sozinhos — e o lucro de cada item aparece calculado.
            </p>
            <Link
              to="/auth"
              className="mt-10 inline-flex rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              data-aos="fade-up"
              data-aos-delay="200"
            >
              Entrar na conta
            </Link>
          </div>

          <div data-aos="fade-left" data-aos-delay="150">
            <StepsCube steps={steps} />
          </div>
        </section>

        <DevelopersSection />

        <ContactForm />

        <footer className="rule-top py-10 text-sm text-muted-foreground" data-aos="fade-up">
          Almoxá — controle de estoque simples para quem compra e revende.
        </footer>
      </main>
    </div>
  );
}
