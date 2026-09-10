import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AgendaTabs } from "@/agenda/components/agenda-tabs";
import { AppShell } from "@/components/AppShell";
import { AppointmentCard, type AgendamentoNaLista } from "@/agenda/components/appointment-card";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { useProvider } from "@/agenda/hooks/use-provider";
import { supabase } from "@/integrations/supabase/client";
import { cancelarPeloPrestador } from "@/agenda/lib/provider.functions";
import { diaPorExtenso, diaRelativo } from "@/agenda/lib/formato";
import { instantToIsoDate } from "@/agenda/lib/timezone";

export const Route = createFileRoute("/_authenticated/agenda/")({
  head: () => ({ meta: [{ title: "Agenda — Almoxá" }] }),
  component: PaginaDaAgenda,
});

type Aba = "proximos" | "passados";

function PaginaDaAgenda() {
  const provider = useProvider();
  const queryClient = useQueryClient();
  const [aba, setAba] = useState<Aba>("proximos");

  const timeZone = provider.data?.timezone ?? "America/Sao_Paulo";

  const agendamentos = useQuery({
    queryKey: ["agendamentos", provider.data?.id, aba],
    queryFn: async (): Promise<AgendamentoNaLista[]> => {
      const agora = new Date().toISOString();
      // A RLS já limita ao prestador logado; o filtro aqui é só de período.
      const consulta = supabase.from("appointments").select(
        `id, starts_at, ends_at, status, client_name, client_email, client_phone, notes,
           services ( name, duration_minutes )`,
      );

      const { data, error } =
        aba === "proximos"
          ? await consulta
              .gte("starts_at", agora)
              .order("starts_at", { ascending: true })
              // Teto como o do histórico: com max_days_ahead em 365 e agenda
              // cheia, "tudo o que vem pela frente" é uma consulta que só
              // cresce, e a tela renderiza cada linha num cartão.
              .limit(200)
          : await consulta
              .lt("starts_at", agora)
              .order("starts_at", { ascending: false })
              .limit(100);

      if (error) throw error;

      return (data ?? []).map((linha) => {
        const servico = Array.isArray(linha.services) ? linha.services[0] : linha.services;
        return {
          id: linha.id,
          starts_at: linha.starts_at,
          ends_at: linha.ends_at,
          status: linha.status,
          client_name: linha.client_name,
          client_email: linha.client_email,
          client_phone: linha.client_phone,
          notes: linha.notes,
          servico: servico?.name ?? "Atendimento",
          duracaoMinutos: servico?.duration_minutes ?? 0,
        };
      });
    },
    enabled: !!provider.data,
  });

  const cancelar = useMutation({
    mutationFn: (id: string) => cancelarPeloPrestador({ data: { id } }),
    onSuccess: () => {
      toast.success("Cancelado. O cliente foi avisado por e-mail.");
      void queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível cancelar."),
  });

  // Concluir não manda e-mail, então vai direto pelo cliente do navegador —
  // a RLS libera UPDATE de `status` pro dono da agenda.
  const concluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("appointments")
        .update({ status: "concluido" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marcado como concluído.");
      void queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
    },
    onError: () => toast.error("Não foi possível marcar como concluído."),
  });

  const ocupado = cancelar.isPending || concluir.isPending;
  const lista = agendamentos.data ?? [];
  const porDia = agruparPorDia(lista, timeZone);
  const confirmadosFuturos = lista.filter((a) => a.status === "confirmado").length;

  return (
    <AppShell
      title="Agenda"
      description={
        aba === "proximos"
          ? `${confirmadosFuturos} ${confirmadosFuturos === 1 ? "horário marcado" : "horários marcados"} pela frente.`
          : "Histórico dos últimos atendimentos."
      }
      action={
        <Link
          to="/agenda/link"
          className="flex min-h-10 items-center gap-2 rounded-md border border-border-strong bg-card px-3.5 py-2 text-sm transition-colors hover:bg-secondary"
        >
          <CalendarDays className="size-4" />
          Sincronizar no celular
        </Link>
      }
    >
      <AgendaTabs />
      <div className="flex gap-1 rounded-md bg-muted p-1" role="tablist">
        {(["proximos", "passados"] as const).map((valor) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={aba === valor}
            onClick={() => setAba(valor)}
            className={`min-h-9 flex-1 rounded-sm px-3 py-1.5 text-sm transition-colors ${
              aba === valor
                ? "bg-card font-medium text-foreground shadow-paper"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {valor === "proximos" ? "Próximos" : "Passados"}
          </button>
        ))}
      </div>

      {provider.isPending ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <BoxSpinner size={36} />
          <p className="text-sm text-muted-foreground">Carregando a agenda…</p>
        </div>
      ) : !provider.data ? (
        // Sem cadastro de prestador a consulta fica desabilitada, e consulta
        // desabilitada é `isPending` pra sempre no react-query — era o que
        // deixava esta tela girando sem fim. A migration retroativa criou o
        // cadastro de todo mundo, então isto aqui virou beira de precipício:
        // continua valendo por causa da conta que aparecer antes de a
        // migration rodar no ambiente.
        <SemCadastro />
      ) : agendamentos.isPending ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <BoxSpinner size={36} />
          <p className="text-sm text-muted-foreground">Carregando a agenda…</p>
        </div>
      ) : agendamentos.isError ? (
        <p className="paper-panel mt-6 p-6 text-center text-sm text-destructive">
          Não foi possível carregar a agenda. Recarregue a página.
        </p>
      ) : porDia.length === 0 ? (
        <Vazio aba={aba} />
      ) : (
        <div className="mt-6 space-y-8">
          {porDia.map(({ dia, itens }) => (
            <section key={dia}>
              <h2 className="rule-top sticky top-[65px] z-10 bg-background/95 py-2.5 text-sm font-medium backdrop-blur">
                {diaRelativo(dia, instantToIsoDate(new Date(), timeZone)) ??
                  diaPorExtenso(`${dia}T12:00:00Z`, "UTC")}
                <span className="ml-2 font-normal text-muted-foreground">
                  · {itens.length} {itens.length === 1 ? "horário" : "horários"}
                </span>
              </h2>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {itens.map((agendamento) => (
                  <AppointmentCard
                    key={agendamento.id}
                    agendamento={agendamento}
                    timeZone={timeZone}
                    ocupado={ocupado}
                    onCancelar={(id) => cancelar.mutate(id)}
                    onConcluir={(id) => concluir.mutate(id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}

/**
 * Beira de precipício da tela: conta sem linha em `providers`.
 *
 * Diz o que aconteceu e como sair, em vez de um spinner eterno ou de um
 * "cadastro não encontrado" que não sugere nada. Recarregar resolve porque o
 * cadastro nasce no primeiro login (gatilho) ou na migration retroativa.
 */
function SemCadastro() {
  return (
    <div className="paper-panel mt-6 p-10 text-center">
      <CalendarDays className="mx-auto size-7 text-muted-foreground" />
      <p className="mt-4 text-base">Sua agenda ainda não foi preparada</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Isso costuma se resolver ao recarregar a página. Se continuar assim,
        fale com o suporte — o cadastro de prestador desta conta não foi criado.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Recarregar
      </button>
    </div>
  );
}

function Vazio({ aba }: { aba: Aba }) {
  return (
    <div className="paper-panel mt-6 p-10 text-center">
      <CalendarDays className="mx-auto size-7 text-muted-foreground" />
      <p className="mt-4 text-base">
        {aba === "proximos" ? "Nenhum horário marcado ainda" : "Nada no histórico"}
      </p>
      {aba === "proximos" ? (
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Publique seus serviços, marque quando atende e mande{" "}
          <Link to="/agenda/link" className="underline underline-offset-2 hover:text-foreground">
            seu link
          </Link>{" "}
          para os clientes.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Agrupa por dia do calendário do prestador.
 *
 * Agrupar pela data do navegador colocaria o atendimento das 22h em outro dia
 * pra quem abrisse a agenda de outro fuso — por isso a chave sai de
 * `instantToIsoDate` com o fuso do prestador, não de `toDateString()`.
 */
function agruparPorDia(
  lista: AgendamentoNaLista[],
  timeZone: string,
): { dia: string; itens: AgendamentoNaLista[] }[] {
  const mapa = new Map<string, AgendamentoNaLista[]>();

  for (const item of lista) {
    const dia = instantToIsoDate(new Date(item.starts_at), timeZone);
    const atual = mapa.get(dia);
    if (atual) atual.push(item);
    else mapa.set(dia, [item]);
  }

  // A ordem de inserção já vem da consulta (crescente em "próximos",
  // decrescente em "passados"), então o Map preserva a ordem certa nos dois.
  return [...mapa.entries()].map(([dia, itens]) => ({ dia, itens }));
}
