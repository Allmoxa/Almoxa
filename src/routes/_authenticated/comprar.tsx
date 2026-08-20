import { createFileRoute } from "@tanstack/react-router";
import { requireOwner } from "@/lib/guards";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { supabase } from "@/integrations/supabase/client";
import {
  currency,
  purchaseSuggestions,
  qty,
  NON_SALE_SOURCES_FILTER,
  type Product,
  type Sale,
} from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/comprar")({
  head: () => ({
    meta: [
      { title: "Comprar — Almoxá" },
      {
        name: "description",
        content:
          "A lista do que repor na próxima viagem, calculada pelo ritmo de venda de cada produto.",
      },
      { property: "og:title", content: "Comprar — Almoxá" },
      {
        property: "og:description",
        content:
          "A lista do que repor na próxima viagem, calculada pelo ritmo de venda de cada produto.",
      },
    ],
  }),
  beforeLoad: requireOwner,
  component: ComprarPage,
});

/** Janela usada para medir o ritmo de venda. Fixa: o que muda é o período a cobrir. */
const WINDOW_DAYS = 30;

const COVER_OPTIONS = [
  { days: 15, label: "15 dias" },
  { days: 30, label: "1 mês" },
  { days: 60, label: "2 meses" },
] as const;

const inputClass =
  "w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-right text-sm tabular-nums outline-none transition-colors focus:border-ring";

const num = (value: string) => {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/** "acabou", "hoje", "3 dias" — o dono não quer ler 0,7 dia de cobertura. */
const coverageLabel = (daysLeft: number, stock: number) => {
  if (stock <= 0) return "acabou";
  if (!Number.isFinite(daysLeft)) return "—";
  if (daysLeft < 1) return "hoje";
  return `${Math.floor(daysLeft)} dias`;
};

function ComprarPage() {
  const [coverDays, setCoverDays] = useState<number>(30);
  // Quantidade digitada por cima da sugestão, e itens desmarcados da lista.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<Record<string, true>>({});

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, sku, quantity, purchase_price, sale_price, notes, created_at, is_ingredient",
        )
        .eq("is_ingredient", false)
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movements")
        .select("product_id, quantity, unit_price, unit_cost, created_at")
        .eq("kind", "out")
        .not("source", "in", NON_SALE_SOURCES_FILTER)
        .is("reversed_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Sale[];
    },
  });

  const isLoading = loadingProducts || loadingSales;

  const suggestions = useMemo(
    () => purchaseSuggestions(products, sales, { windowDays: WINDOW_DAYS, coverDays }),
    [products, sales, coverDays],
  );

  // Trocar o período refaz as sugestões, então o que foi digitado sobre as
  // antigas deixa de fazer sentido.
  const changeCover = (days: number) => {
    setCoverDays(days);
    setOverrides({});
    setExcluded({});
  };

  const rows = suggestions.map((item) => {
    const override = overrides[item.product.id];
    const amount = override === undefined ? item.suggested : num(override);
    return { ...item, amount, included: !excluded[item.product.id] && amount > 0 };
  });

  const chosen = rows.filter((row) => row.included);
  const total = chosen.reduce((sum, row) => sum + row.amount * row.unitCost, 0);
  const units = chosen.reduce((sum, row) => sum + row.amount, 0);

  const copyList = async () => {
    if (chosen.length === 0) {
      toast.error("Nenhum item marcado na lista");
      return;
    }
    const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date());
    const body = chosen
      .map(
        (row) =>
          `- ${row.product.name}${row.product.sku ? ` (${row.product.sku})` : ""}: ${qty(row.amount)} un.`,
      )
      .join("\n");
    const text = `Lista de compra — Almoxá\n${date}\n\n${body}\n\nTotal estimado: ${currency(total)}`;

    try {
      await navigator.clipboard.writeText(text);
      toast.success("Lista copiada — é só colar no WhatsApp");
    } catch {
      toast.error("Não consegui copiar. Segure o dedo sobre a lista para copiar à mão.");
    }
  };

  return (
    <AppShell
      title="Comprar"
      description="O que repor na próxima viagem. A conta usa quanto cada produto vendeu nos últimos 30 dias e quanto ainda tem em estoque."
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps">Comprar para durar</p>
          <div className="mt-2 flex gap-2">
            {COVER_OPTIONS.map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => changeCover(option.days)}
                aria-pressed={coverDays === option.days}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  coverDays === option.days
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border-strong text-muted-foreground hover:bg-secondary"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={copyList}
          disabled={chosen.length === 0}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Copiar lista
        </button>
      </div>

      <div className="paper-panel mt-6 overflow-x-auto">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10">
            <BoxSpinner />
            <p className="text-center text-sm text-muted-foreground">Carregando…</p>
          </div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Nada para repor por enquanto. Ou o estoque cobre o período escolhido, ou ainda não há
            venda registrada nos últimos {WINDOW_DAYS} dias.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label-caps px-5 py-3 font-normal">Produto</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Tem</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Vende/dia</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Dura</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Comprar</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Custo un.</th>
                <th className="label-caps px-5 py-3 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.product.id}
                  className={`border-b border-border last:border-0 ${row.included ? "" : "opacity-45"}`}
                >
                  <td className="px-5 py-4">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={!excluded[row.product.id]}
                        onChange={(event) =>
                          setExcluded((current) => {
                            const next = { ...current };
                            if (event.target.checked) delete next[row.product.id];
                            else next[row.product.id] = true;
                            return next;
                          })
                        }
                        className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
                      />
                      <span>
                        <span className="font-medium">{row.product.name}</span>
                        {row.product.sku ? (
                          <span className="block font-mono text-xs text-muted-foreground">
                            {row.product.sku}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums">{qty(row.product.quantity)}</td>
                  <td className="px-3 py-4 text-right tabular-nums text-muted-foreground">
                    {row.perDay.toFixed(1).replace(".", ",")}
                  </td>
                  <td
                    className={`px-3 py-4 text-right ${row.product.quantity <= 0 ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {coverageLabel(row.daysLeft, row.product.quantity)}
                  </td>
                  <td className="px-3 py-4">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={overrides[row.product.id] ?? String(row.suggested)}
                      onChange={(event) =>
                        setOverrides((current) => ({
                          ...current,
                          [row.product.id]: event.target.value,
                        }))
                      }
                      aria-label={`Quanto comprar de ${row.product.name}`}
                      className={`w-20 ${inputClass}`}
                    />
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums text-muted-foreground">
                    {currency(row.unitCost)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums">
                    {currency(row.amount * row.unitCost)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong">
                <td className="px-5 py-4 label-caps" colSpan={4}>
                  {chosen.length} item(ns) · {qty(units)} un.
                </td>
                <td className="px-3 py-4" />
                <td className="px-3 py-4 text-right label-caps">Vai gastar</td>
                <td className="px-5 py-4 text-right font-display text-xl tabular-nums">
                  {currency(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        O custo é o preço de compra guardado em cada produto. Se o fornecedor mudou o preço, ajuste
        no Estoque para a conta bater.
      </p>
    </AppShell>
  );
}
