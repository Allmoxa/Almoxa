import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { CalendarX, Clock, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookingForm } from "@/agenda/components/booking-form";
import { BookingSteps, type Etapa } from "@/agenda/components/booking-steps";
import { DayStrip } from "@/agenda/components/day-strip";
import { LogoBracket } from "@/components/logo-bracket";
import { ServicePicker } from "@/agenda/components/service-picker";
import { SlotGrid } from "@/agenda/components/slot-grid";
import { BoxSpinner } from "@/components/ui/box-spinner";
import {
  carregarAgendaPublica,
  carregarHorarios,
  confirmarAgendamento,
  type AgendaPublica,
} from "@/agenda/lib/booking.functions";
import { completo, diaPorExtenso, fusoDoNavegador, siglaDoFuso } from "@/agenda/lib/formato";
import { formatarDuracao, formatarPreco, type DadosDoCliente } from "@/agenda/lib/validation";

/**
 * Página pública de agendamento — o link que o cliente recebe.
 *
 * Sem login, e é esse o ponto: cada campo, botão ou etapa a mais aqui é uma
 * chance de a pessoa desistir. Quatro etapas curtas, uma decisão por tela,
 * e o resumo do que já foi escolhido sempre à vista pra ninguém se perder.
 *
 * SSR ligado: o link costuma chegar por WhatsApp, e a prévia do link precisa
 * do nome do prestador renderizado no servidor.
 */
export const Route = createFileRoute("/a/$slug")({
  loader: async ({ params }) => {
    const agenda = await carregarAgendaPublica({ data: { slug: params.slug } });
    // Slug inexistente é endereço errado, não falha: cai no notFoundComponent
    // do __root em vez da tela de erro.
    if (!agenda) throw notFound();
    return agenda;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Agendar com ${loaderData?.displayName ?? "…"} — Almoxá Agenda` },
      {
        name: "description",
        content:
          loaderData?.headline ??
          `Escolha o serviço e o horário com ${loaderData?.displayName ?? ""}. Sem cadastro.`,
      },
      { property: "og:title", content: `Agendar com ${loaderData?.displayName ?? ""}` },
    ],
  }),
  pendingComponent: () => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <BoxSpinner size={40} />
      <p className="text-sm text-muted-foreground">Carregando a agenda…</p>
    </div>
  ),
  pendingMs: 200,
  pendingMinMs: 400,
  component: PaginaPublica,
});

type Escolha = {
  servicoId: string | null;
  dia: string | null;
  inicio: string | null;
};

function PaginaPublica() {
  const agenda = Route.useLoaderData();
  const { slug } = Route.useParams();
  const navigate = useNavigate();

  const [escolha, setEscolha] = useState<Escolha>({ servicoId: null, dia: null, inicio: null });
  const [etapa, setEtapa] = useState<Etapa>(0);

  const servico = agenda.servicos.find((s) => s.id === escolha.servicoId) ?? null;

  const horarios = useQuery({
    queryKey: ["horarios", slug, escolha.servicoId, escolha.dia],
    queryFn: () =>
      carregarHorarios({
        data: { slug, serviceId: escolha.servicoId!, isoDate: escolha.dia! },
      }),
    enabled: !!escolha.servicoId && !!escolha.dia,
    // A grade envelhece rápido: alguém pode marcar enquanto esta tela está
    // aberta. Zero de staleTime faz voltar pra etapa 3 buscar de novo.
    staleTime: 0,
  });

  const confirmar = useMutation({
    mutationFn: (dados: DadosDoCliente & { website?: string }) =>
      confirmarAgendamento({
        data: {
          ...dados,
          slug,
          serviceId: escolha.servicoId!,
          inicio: escolha.inicio!,
        },
      }),
    onSuccess: (resultado) => {
      // O comprovante mora na própria rota do token: assim o cliente pode
      // recarregar, favoritar ou voltar depois sem perder o agendamento.
      navigate({ to: "/agendamento/$token", params: { token: resultado.token } });
    },
    onError: (erro: Error) => {
      toast.error(erro.message || "Não foi possível concluir. Tente de novo.");
      // "Horário acabou de ser preenchido" só faz sentido de volta na grade,
      // já recarregada.
      if (/horário/i.test(erro.message)) {
        setEscolha((e) => ({ ...e, inicio: null }));
        setEtapa(2);
        void horarios.refetch();
      }
    },
  });

  if (!agenda.accepting) return <AgendaFechada agenda={agenda} />;

  const irPara = (proxima: Etapa) => setEtapa(proxima);

  const voltar =
    etapa === 0
      ? undefined
      : () => {
          // Voltar limpa o que foi escolhido depois: manter um horário de um
          // dia que não é mais o selecionado geraria uma confirmação errada.
          if (etapa === 3) setEscolha((e) => ({ ...e, inicio: null }));
          if (etapa === 2) setEscolha((e) => ({ ...e, dia: null, inicio: null }));
          if (etapa === 1) setEscolha({ servicoId: null, dia: null, inicio: null });
          setEtapa((etapa - 1) as Etapa);
        };

  return (
    <div className="min-h-screen bg-background paper-texture-bg">
      <Cabecalho agenda={agenda} />

      <main className="mx-auto max-w-3xl px-4 pb-8 sm:px-6">
        <BookingSteps etapa={etapa} onVoltar={voltar} />

        <Resumo agenda={agenda} escolha={escolha} servico={servico} />

        <div key={etapa} className="animate-step-slide mt-6">
          {etapa === 0 ? (
            <>
              <h2 className="text-xl sm:text-2xl">Qual serviço você quer?</h2>
              <div className="mt-4">
                <ServicePicker
                  servicos={agenda.servicos}
                  selecionado={escolha.servicoId}
                  onSelecionar={(id) => {
                    setEscolha({ servicoId: id, dia: null, inicio: null });
                    irPara(1);
                  }}
                />
              </div>
            </>
          ) : null}

          {etapa === 1 ? (
            <>
              <h2 className="text-xl sm:text-2xl">Que dia fica bom?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Só aparecem os dias em que {agenda.displayName} atende.
              </p>
              <div className="mt-4">
                <DayStrip
                  dias={agenda.diasDisponiveis}
                  hoje={agenda.primeiroDia}
                  selecionado={escolha.dia}
                  onSelecionar={(dia) => {
                    setEscolha((e) => ({ ...e, dia, inicio: null }));
                    irPara(2);
                  }}
                />
              </div>
            </>
          ) : null}

          {etapa === 2 ? (
            <>
              <h2 className="text-xl sm:text-2xl">
                {escolha.dia
                  ? diaPorExtenso(`${escolha.dia}T12:00:00Z`, "UTC")
                  : "Escolha o horário"}
              </h2>
              <FusoDiferente timeZone={agenda.timeZone} />
              <div className="mt-4">
                <SlotGrid
                  horarios={horarios.data?.horarios ?? []}
                  carregando={horarios.isPending || horarios.isFetching}
                  selecionado={escolha.inicio}
                  onSelecionar={(inicio) => {
                    setEscolha((e) => ({ ...e, inicio }));
                    irPara(3);
                  }}
                />
              </div>
              {horarios.isError ? (
                <p className="mt-4 text-center text-sm text-destructive">
                  Não foi possível carregar os horários. Volte e tente de novo.
                </p>
              ) : null}
            </>
          ) : null}

          {etapa === 3 ? (
            <>
              <h2 className="text-xl sm:text-2xl">Só faltam seus dados</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                A confirmação chega por e-mail, com o convite pro seu calendário.
              </p>
              <div className="mt-5">
                <BookingForm
                  enviando={confirmar.isPending}
                  onEnviar={(dados) => confirmar.mutate(dados)}
                />
              </div>
            </>
          ) : null}
        </div>
      </main>

      <Rodape />
    </div>
  );
}

function Cabecalho({ agenda }: { agenda: AgendaPublica }) {
  return (
    <header className="mx-auto max-w-3xl px-4 pt-8 pb-6 sm:px-6 sm:pt-12">
      <div className="font-logo text-lg font-semibold">
        <LogoBracket>Almoxá Agenda</LogoBracket>
      </div>
      <h1 className="mt-6 text-3xl sm:text-4xl">{agenda.displayName}</h1>
      {agenda.headline ? (
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
          {agenda.headline}
        </p>
      ) : null}
    </header>
  );
}

/**
 * Resumo do que já foi escolhido.
 *
 * Fica logo abaixo do trilho de etapas e só mostra o que já existe. É o que
 * permite voltar sem medo: o cliente sempre vê o estado atual da escolha, em
 * vez de ter que confiar na memória entre uma tela e outra.
 */
function Resumo({
  agenda,
  escolha,
  servico,
}: {
  agenda: AgendaPublica;
  escolha: Escolha;
  servico: { name: string; duration_minutes: number; price_cents: number | null } | null;
}) {
  if (!servico) return null;

  return (
    <dl className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border bg-card/60 px-3.5 py-2.5 text-sm">
      <div className="flex items-baseline gap-1.5">
        <dt className="sr-only">Serviço</dt>
        <dd className="font-medium">{servico.name}</dd>
        <dd className="text-xs text-muted-foreground">
          · {formatarDuracao(servico.duration_minutes)} · {formatarPreco(servico.price_cents)}
        </dd>
      </div>

      {escolha.inicio ? (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="size-3.5" />
          <dt className="sr-only">Horário</dt>
          <dd>{completo(escolha.inicio, agenda.timeZone)}</dd>
        </div>
      ) : escolha.dia ? (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <dt className="sr-only">Dia</dt>
          <dd>{diaPorExtenso(`${escolha.dia}T12:00:00Z`, "UTC")}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/**
 * Aviso de fuso.
 *
 * Só aparece quando o relógio de quem agenda não bate com o do prestador —
 * caso raro, mas em que "09:00" sem qualificação vira uma consulta perdida.
 * O cálculo roda depois da montagem porque o fuso do navegador não existe no
 * servidor, e renderizar diferente nos dois lados quebra a hidratação.
 */
function FusoDiferente({ timeZone }: { timeZone: string }) {
  const [fusoLocal, setFusoLocal] = useState<string | null>(null);
  useEffect(() => setFusoLocal(fusoDoNavegador()), []);

  if (!fusoLocal || fusoLocal === timeZone) return null;

  return (
    <p className="mt-3 flex items-start gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs leading-relaxed">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Horários no fuso de quem atende ({timeZone.replace(/_/g, " ")},{" "}
        {siglaDoFuso(new Date(), timeZone)}), não no seu.
      </span>
    </p>
  );
}

function AgendaFechada({ agenda }: { agenda: AgendaPublica }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background paper-texture-bg px-4">
      <div className="max-w-sm text-center">
        <div className="mx-auto block w-fit font-logo text-lg font-semibold">
          <LogoBracket>Almoxá Agenda</LogoBracket>
        </div>
        <CalendarX className="mx-auto mt-10 size-8 text-muted-foreground" />
        <h1 className="mt-5 text-2xl">Agenda fechada</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {agenda.displayName} não está aceitando agendamentos no momento. Tente de novo mais tarde.
        </p>
      </div>
    </div>
  );
}

function Rodape() {
  return (
    <footer className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="rule-top pt-6 text-center text-xs text-muted-foreground">
        Feito com{" "}
        <Link to="/" className="underline underline-offset-2 hover:text-foreground">
          Almoxá Agenda
        </Link>
      </p>
    </footer>
  );
}
