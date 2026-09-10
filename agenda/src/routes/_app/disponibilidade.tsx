import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarOff, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AgendaShell } from "@/components/AgendaShell";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { useProvider } from "@/hooks/use-provider";
import { supabase } from "@/integrations/supabase/client";
import type { AvailabilityBlock, AvailabilityRule } from "@/integrations/supabase/types";
import { completo } from "@/lib/formato";
import { isoDateTimeToInstant, minutesOfDay } from "@/lib/timezone";

export const Route = createFileRoute("/_app/disponibilidade")({
  head: () => ({ meta: [{ title: "Disponibilidade — Almoxá Agenda" }] }),
  component: PaginaDeDisponibilidade,
});

const DIAS = [
  { valor: 0, nome: "Domingo", curto: "Dom" },
  { valor: 1, nome: "Segunda", curto: "Seg" },
  { valor: 2, nome: "Terça", curto: "Ter" },
  { valor: 3, nome: "Quarta", curto: "Qua" },
  { valor: 4, nome: "Quinta", curto: "Qui" },
  { valor: 5, nome: "Sexta", curto: "Sex" },
  { valor: 6, nome: "Sábado", curto: "Sáb" },
] as const;

function PaginaDeDisponibilidade() {
  const provider = useProvider();
  const timeZone = provider.data?.timezone ?? "America/Sao_Paulo";

  return (
    <AgendaShell
      title="Disponibilidade"
      description={`Seu expediente da semana e as folgas avulsas. Horários no fuso ${timeZone.replace(/_/g, " ")}.`}
    >
      {provider.isPending ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <BoxSpinner size={36} />
          <p className="text-sm text-muted-foreground">Carregando…</p>
        </div>
      ) : !provider.data ? (
        <p className="paper-panel p-6 text-center text-sm text-muted-foreground">
          Cadastro do prestador não encontrado.
        </p>
      ) : (
        <div className="space-y-10">
          <Expediente providerId={provider.data.id} />
          <Bloqueios providerId={provider.data.id} timeZone={timeZone} />
        </div>
      )}
    </AgendaShell>
  );
}

/**
 * Expediente semanal.
 *
 * Uma linha por faixa, e vários por dia — quem para pro almoço cadastra
 * 09:00–12:00 e 13:00–18:00, e o intervalo simplesmente não existe na grade.
 * Modelar como "abre/fecha" único forçaria a gente a inventar um campo de
 * pausa que não cobriria quem tem duas.
 */
function Expediente({ providerId }: { providerId: string }) {
  const queryClient = useQueryClient();
  const [adicionandoEm, setAdicionandoEm] = useState<number | null>(null);
  const [novoInicio, setNovoInicio] = useState("09:00");
  const [novoFim, setNovoFim] = useState("18:00");

  const regras = useQuery({
    queryKey: ["regras", providerId],
    queryFn: async (): Promise<AvailabilityRule[]> => {
      const { data, error } = await supabase
        .from("availability_rules")
        .select("*")
        .order("weekday")
        .order("starts_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const adicionar = useMutation({
    mutationFn: async ({ weekday }: { weekday: number }) => {
      if (minutesOfDay(novoFim) <= minutesOfDay(novoInicio)) {
        throw new Error("O fim tem que ser depois do começo.");
      }
      const { error } = await supabase.from("availability_rules").insert({
        provider_id: providerId,
        weekday,
        starts_at: novoInicio,
        ends_at: novoFim,
      });
      // 23505 é a UNIQUE (provider_id, weekday, starts_at, ends_at).
      if (error?.code === "23505") throw new Error("Essa faixa já existe nesse dia.");
      if (error) throw error;
    },
    onSuccess: () => {
      setAdicionandoEm(null);
      void queryClient.invalidateQueries({ queryKey: ["regras"] });
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível adicionar."),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("availability_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["regras"] }),
    onError: () => toast.error("Não foi possível remover."),
  });

  const porDia = (weekday: number) => (regras.data ?? []).filter((r) => r.weekday === weekday);

  return (
    <section>
      <h2 className="text-xl">Expediente da semana</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Dia sem faixa nenhuma não aparece para o cliente.
      </p>

      <div className="mt-5 space-y-2">
        {DIAS.map((dia) => {
          const faixas = porDia(dia.valor);
          return (
            <div key={dia.valor} className="paper-panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">{dia.nome}</p>
                {faixas.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Fechado</span>
                ) : null}
              </div>

              {faixas.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {faixas.map((faixa) => (
                    <li
                      key={faixa.id}
                      className="flex items-center gap-2 rounded-md border border-border-strong bg-secondary py-1.5 pl-3 pr-1.5 text-sm"
                    >
                      <span className="font-mono">
                        {faixa.starts_at.slice(0, 5)}–{faixa.ends_at.slice(0, 5)}
                      </span>
                      <button
                        type="button"
                        onClick={() => remover.mutate(faixa.id)}
                        aria-label={`Remover ${faixa.starts_at.slice(0, 5)} às ${faixa.ends_at.slice(0, 5)} de ${dia.nome}`}
                        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {adicionandoEm === dia.valor ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div>
                    <label htmlFor={`inicio-${dia.valor}`} className="label-caps">
                      Das
                    </label>
                    <input
                      id={`inicio-${dia.valor}`}
                      type="time"
                      value={novoInicio}
                      onChange={(e) => setNovoInicio(e.target.value)}
                      className="mt-1 rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring"
                    />
                  </div>
                  <div>
                    <label htmlFor={`fim-${dia.valor}`} className="label-caps">
                      Até
                    </label>
                    <input
                      id={`fim-${dia.valor}`}
                      type="time"
                      value={novoFim}
                      onChange={(e) => setNovoFim(e.target.value)}
                      className="mt-1 rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => adicionar.mutate({ weekday: dia.valor })}
                    disabled={adicionar.isPending}
                    className="min-h-10 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    Adicionar
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdicionandoEm(null)}
                    className="min-h-10 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdicionandoEm(dia.valor)}
                  className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                  Adicionar faixa
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Folgas e feriados.
 *
 * Aqui o dado é um instante concreto, não uma regra — por isso a conversão
 * de "dia + hora local" pra TIMESTAMPTZ passa por `isoDateTimeToInstant` com
 * o fuso do prestador. Usar `new Date("2026-09-15T09:00")` pegaria o fuso do
 * navegador, e quem viajasse marcaria folga na hora errada.
 */
function Bloqueios({ providerId, timeZone }: { providerId: string; timeZone: string }) {
  const queryClient = useQueryClient();
  const [dia, setDia] = useState("");
  const [diaInteiro, setDiaInteiro] = useState(true);
  const [inicio, setInicio] = useState("09:00");
  const [fim, setFim] = useState("18:00");
  const [motivo, setMotivo] = useState("");

  const bloqueios = useQuery({
    queryKey: ["bloqueios", providerId],
    queryFn: async (): Promise<AvailabilityBlock[]> => {
      const { data, error } = await supabase
        .from("availability_blocks")
        .select("*")
        .gte("ends_at", new Date().toISOString())
        .order("starts_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!dia) throw new Error("Escolha o dia.");
      if (!diaInteiro && minutesOfDay(fim) <= minutesOfDay(inicio)) {
        throw new Error("O fim tem que ser depois do começo.");
      }

      const de = isoDateTimeToInstant(dia, diaInteiro ? "00:00" : inicio, timeZone);
      const ate = isoDateTimeToInstant(dia, diaInteiro ? "23:59" : fim, timeZone);

      const { error } = await supabase.from("availability_blocks").insert({
        provider_id: providerId,
        starts_at: de.toISOString(),
        ends_at: ate.toISOString(),
        reason: motivo.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bloqueio criado.");
      setDia("");
      setMotivo("");
      void queryClient.invalidateQueries({ queryKey: ["bloqueios"] });
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível bloquear."),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("availability_blocks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["bloqueios"] }),
    onError: () => toast.error("Não foi possível remover."),
  });

  const lista = bloqueios.data ?? [];

  return (
    <section>
      <h2 className="text-xl">Folgas e bloqueios</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Feriado, viagem, compromisso pessoal. O horário some do seu link nesse período.
      </p>

      <div className="paper-panel mt-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="bloqueio-dia" className="label-caps">
              Dia
            </label>
            <input
              id="bloqueio-dia"
              type="date"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-ring"
            />
          </div>

          <div>
            <label htmlFor="bloqueio-motivo" className="label-caps">
              Motivo (opcional)
            </label>
            <input
              id="bloqueio-motivo"
              type="text"
              value={motivo}
              maxLength={200}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Feriado, viagem…"
              className="mt-1.5 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-ring"
            />
          </div>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={diaInteiro}
            onChange={(e) => setDiaInteiro(e.target.checked)}
            className="size-4 accent-[var(--color-accent)]"
          />
          Dia inteiro
        </label>

        {!diaInteiro ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="bloqueio-inicio" className="label-caps">
                Das
              </label>
              <input
                id="bloqueio-inicio"
                type="time"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                className="mt-1 rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring"
              />
            </div>
            <div>
              <label htmlFor="bloqueio-fim" className="label-caps">
                Até
              </label>
              <input
                id="bloqueio-fim"
                type="time"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                className="mt-1 rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring"
              />
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => criar.mutate()}
          disabled={criar.isPending || !dia}
          className="mt-4 flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="size-4" />
          Bloquear
        </button>
      </div>

      {lista.length === 0 ? (
        <p className="mt-4 flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <CalendarOff className="size-4" />
          Nenhum bloqueio pela frente.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {lista.map((bloqueio) => (
            <li
              key={bloqueio.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm">
                  {completo(bloqueio.starts_at, timeZone)} → {completo(bloqueio.ends_at, timeZone)}
                </p>
                {bloqueio.reason ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{bloqueio.reason}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => remover.mutate(bloqueio.id)}
                aria-label="Remover bloqueio"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
