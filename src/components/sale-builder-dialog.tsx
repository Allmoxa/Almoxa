import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ProductPicker } from "@/components/product-picker";
import { currency, qty, splitReference, splitSaleTotal, type Product } from "@/lib/inventory";

export type BuiltSaleLine = {
  product: Product;
  quantity: number;
  unit_price: number;
};

type Row = { key: number; productId: string; quantity: string };

type Props = {
  products: Product[];
  /** Mais vendidos recentemente, para adicionar com um clique em vez de digitar. */
  frequentProducts?: Product[];
  onCancel: () => void;
  onSubmit: (lines: BuiltSaleLine[], total: number) => void;
};

const inputClass =
  "w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-ring";

const num = (value: string) => {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

let nextKey = 1;
const newRow = (): Row => ({ key: nextKey++, productId: "", quantity: "1" });

export function SaleBuilderDialog({ products, frequentProducts = [], onCancel, onSubmit }: Props) {
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [total, setTotal] = useState("");

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Já no carrinho: soma a quantidade de todas as linhas desse produto, para
  // mostrar no chip e decidir se um clique incrementa em vez de criar linha nova.
  const cartQtyByProduct = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      if (!row.productId) continue;
      totals.set(row.productId, (totals.get(row.productId) ?? 0) + num(row.quantity));
    }
    return totals;
  }, [rows]);

  // Um clique no chip: soma 1 na linha já existente do produto, preenche a
  // primeira linha vazia, ou cria uma linha nova — nessa ordem de preferência.
  const quickAdd = (product: Product) => {
    setRows((current) => {
      const existing = current.find((row) => row.productId === product.id);
      if (existing) {
        return current.map((row) =>
          row.key === existing.key ? { ...row, quantity: String(num(row.quantity) + 1) } : row,
        );
      }
      const empty = current.find((row) => !row.productId);
      if (empty) {
        return current.map((row) => (row.key === empty.key ? { ...row, productId: product.id, quantity: "1" } : row));
      }
      return [...current, { key: nextKey++, productId: product.id, quantity: "1" }];
    });
  };

  const lines = rows.map((row) => {
    const product = byId.get(row.productId) ?? null;
    return { row, product, quantity: num(row.quantity) };
  });
  const filled = lines.filter((line) => line.product && line.quantity > 0);

  // O total sugerido é o preço de tabela; digitar outro valor é o que caracteriza
  // o desconto (ou o acréscimo) a ser rateado.
  const tableTotal = filled.reduce((sum, line) => sum + line.quantity * (line.product?.sale_price ?? 0), 0);
  const effectiveTotal = total.trim() ? num(total) : tableTotal;

  const unitPrices = splitSaleTotal(
    lines.map((line) => ({ quantity: line.quantity, reference: splitReference(line.product) })),
    effectiveTotal,
  );

  // Duas linhas podem apontar para o mesmo produto: o estoque é conferido no somatório.
  const demand = new Map<string, number>();
  for (const line of filled) demand.set(line.product!.id, (demand.get(line.product!.id) ?? 0) + line.quantity);
  const shortages = [...demand]
    .map(([id, wanted]) => ({ product: byId.get(id)!, wanted }))
    .filter((item) => item.product && item.wanted > item.product.quantity);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const submit = () => {
    if (filled.length === 0) {
      toast.error("Escolha ao menos um produto");
      return;
    }
    const shortage = shortages[0];
    if (shortage) {
      toast.error(`Estoque insuficiente de ${shortage.product.name}`);
      return;
    }
    if (effectiveTotal <= 0) {
      toast.error("Informe o valor total da venda");
      return;
    }
    const built = lines
      .map((line, index) => ({ line, unit_price: unitPrices[index] ?? 0 }))
      .filter((item) => item.line.product && item.line.quantity > 0)
      .map((item) => ({
        product: item.line.product!,
        quantity: item.line.quantity,
        unit_price: item.unit_price,
      }));
    onSubmit(built, effectiveTotal);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-foreground/25 px-4 py-10">
      <div className="paper-panel w-full max-w-2xl p-6" style={{ boxShadow: "var(--shadow-lift)" }}>
        <p className="label-caps">Venda</p>
        <h2 className="mt-2 text-2xl">O que saiu do estoque</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha os produtos e a quantidade, informe quanto o cliente pagou no total e o valor de cada peça sai
          calculado.
        </p>

        {frequentProducts.length > 0 ? (
          <div className="mt-5">
            <p className="label-caps">Mais vendidos</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {frequentProducts.map((product) => {
                const empty = product.quantity <= 0;
                const inCart = cartQtyByProduct.get(product.id) ?? 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => quickAdd(product)}
                    disabled={empty}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${
                      inCart > 0
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border-strong hover:bg-secondary"
                    }`}
                  >
                    {product.name}
                    {empty ? " · esgotado" : inCart > 0 ? ` · ${qty(inCart)}` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          {lines.map((line, index) => {
            const short = line.product && line.quantity > line.product.quantity;
            return (
              <div key={line.row.key} className="grid grid-cols-[1fr_5rem_auto] items-start gap-3">
                <div>
                  <ProductPicker
                    products={products}
                    value={line.row.productId}
                    onChange={(productId) => update(line.row.key, { productId })}
                  />
                  {line.product && line.quantity > 0 ? (
                    <p className={`mt-1 text-xs ${short ? "text-destructive" : "text-muted-foreground"}`}>
                      {short
                        ? `Só há ${qty(line.product.quantity)} un. em estoque`
                        : `${currency(unitPrices[index] ?? 0)} por un. — tabela ${currency(line.product.sale_price)}`}
                    </p>
                  ) : null}
                </div>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={line.row.quantity}
                  onChange={(event) => update(line.row.key, { quantity: event.target.value })}
                  aria-label="Quantidade"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setRows((current) => (current.length > 1 ? current.filter((r) => r.key !== line.row.key) : current))}
                  disabled={rows.length === 1}
                  className="px-1 py-1.5 text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                >
                  Remover
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setRows((current) => [...current, newRow()])}
          className="mt-3 rounded-md border border-border-strong px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
        >
          Adicionar produto
        </button>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-5">
          <div>
            <label className="label-caps" htmlFor="sale-total">
              Valor total da venda
            </label>
            <input
              id="sale-total"
              type="number"
              step="0.01"
              min="0"
              value={total}
              onChange={(event) => setTotal(event.target.value)}
              placeholder={tableTotal.toFixed(2)}
              className={`mt-2 w-40 ${inputClass}`}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Vazio usa o preço de tabela: {currency(tableTotal)}
            </p>
          </div>
          <div className="text-right">
            <p className="label-caps">Rateio</p>
            <p className="mt-1 font-display text-2xl tabular-nums">{currency(effectiveTotal)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              dividido entre {qty(filled.reduce((sum, line) => sum + line.quantity, 0))} un.
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={submit}
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Conferir venda
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border-strong px-5 py-2.5 text-sm transition-colors hover:bg-secondary"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
