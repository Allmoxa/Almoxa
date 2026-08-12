import { currency, qty, type ProfitSummary, type Product } from "@/lib/inventory";

type Props = {
  product: Product;
  summary: ProfitSummary;
  onClose: () => void;
};

export function ProductProfitDialog({ product, summary, onClose }: Props) {
  const rows = [
    { label: "Hoje", value: summary.today, units: summary.unitsToday },
    { label: "Últimos 7 dias", value: summary.week, units: summary.unitsWeek },
    { label: "Total", value: summary.total, units: summary.unitsTotal },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/25 px-6" onClick={onClose}>
      <div
        className="paper-panel w-full max-w-sm p-6"
        style={{ boxShadow: "var(--shadow-lift)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="label-caps">Lucro realizado</p>
        <h2 className="mt-2 text-2xl">{product.name}</h2>
        <p className="font-mono text-xs text-muted-foreground">{product.sku}</p>

        {summary.unitsTotal === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">
            Nenhuma venda registrada ainda. O lucro aparece aqui assim que a primeira saída for lançada.
          </p>
        ) : (
          <dl className="mt-5 divide-y divide-border border-y border-border">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between py-3">
                <div>
                  <dt className="text-sm">{row.label}</dt>
                  <dd className="text-xs text-muted-foreground">{qty(row.units)} un. vendidas</dd>
                </div>
                <dd
                  className={`font-display text-xl tabular-nums ${row.value < 0 ? "text-destructive" : "text-success"}`}
                >
                  {currency(row.value)}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          Calculado sobre o custo de compra vigente em cada venda, não sobre o preço de compra atual.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-md border border-border-strong px-4 py-2 text-sm transition-colors hover:bg-secondary"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
