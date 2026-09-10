import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BellRing, CalendarCheck, Link2, Smartphone } from "lucide-react";
import { LogoBracket } from "@/components/logo-bracket";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Almoxá Agenda — agendamento por link, sem cadastro" },
      {
        name: "description",
        content:
          "Mande um link. Seu cliente escolhe o serviço e o horário sem criar conta. Você recebe tudo no calendário do celular.",
      },
    ],
  }),
  component: Home,
});

const PASSOS = [
  {
    icone: Link2,
    titulo: "Você manda um link",
    texto: "Um endereço só seu, com os serviços que você escolher publicar.",
  },
  {
    icone: CalendarCheck,
    titulo: "O cliente marca sozinho",
    texto: "Sem cadastro, sem senha, sem app. Ele vê só os horários que estão de fato livres.",
  },
  {
    icone: Smartphone,
    titulo: "Cai no seu calendário",
    texto: "Assine uma vez no iPhone ou no Android e todo horário novo aparece sozinho.",
  },
  {
    icone: BellRing,
    titulo: "O lembrete sai sozinho",
    texto: "Confirmação na hora e lembrete antes do atendimento, por e-mail.",
  },
];

function Home() {
  return (
    <div className="min-h-screen bg-background paper-texture-bg">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-6 sm:px-6">
        <span className="font-logo text-lg font-semibold">
          <LogoBracket>Almoxá Agenda</LogoBracket>
        </span>
        <Link
          to="/auth"
          className="min-h-10 rounded-md border border-border-strong bg-card px-4 py-2 text-sm transition-colors hover:bg-secondary"
        >
          Entrar
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6">
        <section className="py-14 sm:py-24">
          <p className="label-caps">Agendamento sem atrito</p>
          <h1 className="mt-4 max-w-2xl text-4xl leading-[1.1] sm:text-6xl">
            Seu cliente marca em três toques. Você nem precisa responder.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground">
            O Almoxá Agenda troca a ida e volta no WhatsApp por um link. Ele escolhe o serviço e o
            horário livre; você recebe no calendário do celular.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to="/auth"
              className="flex min-h-12 items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Criar minha agenda
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>

        <section className="rule-top py-14 sm:py-20">
          <h2 className="text-2xl sm:text-3xl">Como funciona</h2>

          <ol className="mt-8 grid gap-4 sm:grid-cols-2">
            {PASSOS.map((passo, i) => (
              <li
                key={passo.titulo}
                className="paper-panel animate-card-rise p-5"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <passo.icone className="size-5 text-accent" />
                <h3 className="mt-3 text-lg">{passo.titulo}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {passo.texto}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="rule-top py-14 sm:py-20">
          <div className="paper-panel p-8 text-center sm:p-12">
            <h2 className="text-2xl sm:text-3xl">Dois horários no mesmo minuto? Não acontece.</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              A checagem de horário livre não fica só na tela: o banco recusa qualquer sobreposição
              na sua agenda. Dois clientes clicando "confirmar" ao mesmo tempo, só um passa — e o
              outro vê a grade atualizada, não uma confirmação falsa.
            </p>
            <Link
              to="/auth"
              className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Começar agora
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p className="rule-top pt-6 text-center text-xs text-muted-foreground">
          Almoxá Agenda — parte da família Almoxá.
        </p>
      </footer>
    </div>
  );
}
