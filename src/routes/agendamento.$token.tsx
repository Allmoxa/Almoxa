import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AddToCalendar } from "@/agenda/components/add-to-calendar";
import { LogoBracket } from "@/components/logo-bracket";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { cancelarPeloCliente, carregarAgendamento } from "@/agenda/lib/booking.functions";
import { completo, diaPorExtenso, hora } from "@/agenda/lib/formato";
import { formatarDuracao, formatarPreco } from "@/agenda/lib/validation";

/**
 * Comprovante do cliente, endereçado pelo token do link.
 *
 * O token é o que substitui a senha: quem tem o link mexe naquele
 * agendamento e em nenhum outro. Por isso a rota é `noindex` — um comprovante
 * indexado no Google entregaria o nome e o horário de alguém a quem
 * pesquisasse o endereço.
 */
export const Route = createFileRoute("/agendamento/$token")({
  loader: async ({ params }) => {
    const agendamento = await carregarAgendamento({ data: { token: params.token } });
    // Token que não existe é link velho ou digitado errado — 404, não erro.
    if (!agendamento) throw notFound();
    return agendamento;
  },
  head: () => ({
    meta: [
      { title: "Seu agendamento — Almoxá Agenda" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  pendingComponent: () => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <BoxSpinner size={40} />
      <p className="text-sm text-muted-foreground">Carregando…</p>
    </div>
  ),
  pendingMs: 200,
  pendingMinMs: 400,
  component: Comprovante,
});

function Comprovante() {
  const agendamento = Route.useLoaderData();
  const router = useRouter();
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);

  const cancelar = useMutation({
    mutationFn: () => cancelarPeloCliente({ data: { token: agendamento.token } }),
    onSuccess: () => {
      setConfirmandoCancelamento(false);
      toast.success("Agendamento desmarcado. Você recebeu um e-mail confirmando.");
      // Invalida o loader pra a tela reler o status do servidor em vez de
      // adivinhar localmente que o cancelamento pegou.
      void router.invalidate();
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível desmarcar."),
  });

  const cancelado = agendamento.status === "cancelado";
  const inicio = new Date(agendamento.inicio);
  const fim = new Date(agendamento.fim);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-md px-4 py-10 sm:py-16">
        <div className="text-center font-logo text-lg font-semibold">
          <LogoBracket>Almoxá Agenda</LogoBracket>
        </div>

        <div className="mt-10 text-center">
          <span
            className={`mx-auto flex size-12 items-center justify-center rounded-full ${
              cancelado ? "bg-muted text-muted-foreground" : "bg-success/15 text-success"
            }`}
          >
            {cancelado ? <X className="size-6" /> : <Check className="size-6" />}
          </span>
          <h1 className="mt-5 text-2xl sm:text-3xl">
            {cancelado ? "Agendamento cancelado" : "Tudo certo!"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {cancelado
              ? "Este horário foi desmarcado e não vale mais."
              : `Seu horário com ${agendamento.prestador} está reservado.`}
          </p>
        </div>

        {/* Canhoto de papel picotado — ver .ticket-stub no styles.css. */}
        <div className={`ticket-stub mt-8 ${cancelado ? "opacity-70" : ""}`}>
          <div className="p-6">
            <p className="label-caps">Quando</p>
            <p className="mt-1 text-lg">{diaPorExtenso(inicio, agendamento.timeZone)}</p>
            <p className="font-mono text-3xl">
              {hora(inicio, agendamento.timeZone)}
              <span className="ml-2 text-base text-muted-foreground">
                – {hora(fim, agendamento.timeZone)}
              </span>
            </p>

            <dl className="rule-top mt-5 space-y-2.5 pt-5 text-sm">
              <Linha rotulo="Serviço" valor={agendamento.servico} />
              <Linha rotulo="Com" valor={agendamento.prestador} />
              <Linha rotulo="Duração" valor={formatarDuracao(agendamento.duracaoMinutos)} />
              <Linha rotulo="Valor" valor={formatarPreco(agendamento.precoCentavos)} />
              <Linha rotulo="Em nome de" valor={agendamento.clienteNome} />
              {agendamento.observacao ? (
                <Linha rotulo="Observação" valor={agendamento.observacao} />
              ) : null}
            </dl>
          </div>

          {!cancelado ? (
            <div className="ticket-perforation p-6 pt-5">
              <AddToCalendar
                uid={agendamento.uid}
                titulo={`${agendamento.servico} — ${agendamento.prestador}`}
                descricao={`${agendamento.servico} com ${agendamento.prestador}.`}
                inicio={inicio}
                fim={fim}
              />
            </div>
          ) : null}
        </div>

        <div className="mt-8 space-y-3 text-center">
          {agendamento.podeCancelar ? (
            <button
              type="button"
              onClick={() => setConfirmandoCancelamento(true)}
              className="text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-destructive"
            >
              Preciso desmarcar
            </button>
          ) : !cancelado && agendamento.status === "confirmado" ? (
            <p className="text-xs text-muted-foreground">
              Este horário já passou e não pode mais ser desmarcado por aqui.
            </p>
          ) : null}

          {cancelado ? (
            <Link
              to="/a/$slug"
              params={{ slug: agendamento.prestadorSlug }}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Marcar outro horário
            </Link>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Guarde este link — é por ele que você acompanha ou desmarca.
          </p>
        </div>
      </main>

      <AlertDialog open={confirmandoCancelamento} onOpenChange={setConfirmandoCancelamento}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desmarcar este horário?</AlertDialogTitle>
            <AlertDialogDescription>
              {completo(inicio, agendamento.timeZone)} — {agendamento.servico} com{" "}
              {agendamento.prestador}. O horário volta a ficar livre para outra pessoa e não dá para
              desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelar.isPending}>Manter</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // O AlertDialogAction fecha o diálogo por conta própria ao ser
                // clicado; segurar aqui mantém ele aberto mostrando "Desmarcando…"
                // até o servidor responder.
                e.preventDefault();
                cancelar.mutate();
              }}
              disabled={cancelar.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelar.isPending ? "Desmarcando…" : "Sim, desmarcar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{rotulo}</dt>
      <dd className="text-right">{valor}</dd>
    </div>
  );
}
