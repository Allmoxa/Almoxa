import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { requireOwner } from "@/lib/guards";
import { supabase } from "@/integrations/supabase/client";
import { currency, qty } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe — Almoxá" },
      {
        name: "description",
        content: "Comissionados da loja, percentual de cada um e quanto têm a receber.",
      },
    ],
  }),
  beforeLoad: requireOwner,
  component: EquipePage,
});

type TeamMember = {
  id: string;
  email: string;
  commission_rate: number;
  sold_total: number;
  commission_total: number;
  sales_count: number;
};

const PERIODS = [
  { key: "mes", label: "Mês atual" },
  { key: "30", label: "Últimos 30 dias" },
  { key: "tudo", label: "Tudo" },
] as const;

type PeriodKey = (typeof PERIODS)[number]["key"];

/** Início do período em ISO, ou null para "tudo". */
function periodStart(key: PeriodKey): string | null {
  if (key === "tudo") return null;
  const now = new Date();
  if (key === "mes") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const days = new Date(now);
  days.setDate(days.getDate() - 30);
  return days.toISOString();
}

const inputClass =
  "w-24 rounded-md border border-input bg-card px-2.5 py-1.5 text-right text-sm tabular-nums outline-none transition-colors focus:border-ring";

const num = (value: string) => {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : NaN;
};

const percent = (value: number) =>
  `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`;

function EquipePage() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<PeriodKey>("mes");
  // Só as taxas que estão sendo editadas agora; o resto vem do servidor.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: team = [], isLoading } = useQuery({
    queryKey: ["store-team", period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("store_team", { _since: periodStart(period) });
      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
  });

  const saveRate = useMutation({
    mutationFn: async ({ memberId, rate }: { memberId: string; rate: number }) => {
      const { error } = await supabase.rpc("set_commission_rate", {
        _member_id: memberId,
        _rate: rate,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success("Comissão atualizada");
      setDrafts((current) => {
        const next = { ...current };
        delete next[variables.memberId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["store-team"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao salvar"),
  });

  const save = (member: TeamMember) => {
    const draft = drafts[member.id];
    if (draft === undefined) return;
    const rate = num(draft);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      toast.error("Informe um percentual entre 0 e 100");
      return;
    }
    saveRate.mutate({ memberId: member.id, rate });
  };

  const totals = team.reduce(
    (acc, member) => ({
      sold: acc.sold + Number(member.sold_total),
      commission: acc.commission + Number(member.commission_total),
      sales: acc.sales + Number(member.sales_count),
    }),
    { sold: 0, commission: 0, sales: 0 },
  );

  return (
    <AppShell
      title="Equipe"
      description="O percentual de cada comissionado e quanto ele tem a receber. Mudar o percentual vale para as próximas vendas — o que já foi vendido mantém a taxa do dia."
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps">Período</p>
          <div className="mt-2 flex gap-2">
            {PERIODS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setPeriod(option.key)}
                aria-pressed={period === option.key}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  period === option.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border-strong text-muted-foreground hover:bg-secondary"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-right">
          <p className="label-caps">A pagar no período</p>
          <p className="mt-1 font-display text-3xl tabular-nums">{currency(totals.commission)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            sobre {currency(totals.sold)} vendidos em {qty(totals.sales)} lançamentos
          </p>
        </div>
      </div>

      <div className="paper-panel mt-6 overflow-x-auto">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10">
            <BoxSpinner />
            <p className="text-center text-sm text-muted-foreground">Carregando…</p>
          </div>
        ) : team.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Nenhum comissionado nesta loja ainda. As contas são criadas pelo onisciente, que também
            escolhe de qual loja cada vendedor tira o estoque.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label-caps px-5 py-3 font-normal">Comissionado</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Vendas</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Valor vendido</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Comissão</th>
                <th className="label-caps px-3 py-3 text-right font-normal">A receber</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {team.map((member) => {
                const draft = drafts[member.id];
                const dirty = draft !== undefined && num(draft) !== Number(member.commission_rate);
                return (
                  <tr key={member.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-4 font-medium">{member.email}</td>
                    <td className="px-3 py-4 text-right tabular-nums text-muted-foreground">
                      {qty(Number(member.sales_count))}
                    </td>
                    <td className="px-3 py-4 text-right tabular-nums">
                      {currency(Number(member.sold_total))}
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          value={draft ?? String(Number(member.commission_rate))}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [member.id]: event.target.value,
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") save(member);
                          }}
                          aria-label={`Percentual de ${member.email}`}
                          className={inputClass}
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-right font-display text-lg tabular-nums text-success">
                      {currency(Number(member.commission_total))}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {dirty ? (
                        <button
                          type="button"
                          onClick={() => save(member)}
                          disabled={saveRate.isPending}
                          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          Salvar
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {percent(Number(member.commission_rate))} vigente
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        A comissão é calculada sobre o valor da venda, com a taxa que valia no dia de cada
        lançamento. Venda estornada sai da conta junto com o estorno.
      </p>
    </AppShell>
  );
}
