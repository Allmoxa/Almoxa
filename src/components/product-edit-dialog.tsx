import { useState } from "react";
import { toast } from "sonner";
import { currency, qty, type Product } from "@/lib/inventory";

export type ProductEditValues = {
  quantity: number;
  purchase_price: number;
  sale_price: number;
};

type Props = {
  product: Product;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: ProductEditValues) => void;
};

const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring";

const num = (value: string) => {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmt = (value: number) => String(Math.round(value * 100) / 100);

export function ProductEditDialog({ product, pending, onCancel, onSubmit }: Props) {
  const [quantity, setQuantity] = useState(fmt(product.quantity));
  const [purchase, setPurchase] = useState(fmt(product.purchase_price));
  const [sale, setSale] = useState(fmt(product.sale_price));
  const [profit, setProfit] = useState(fmt(product.sale_price - product.purchase_price));

  // Compra e venda mandam no lucro; mexer no lucro reescreve o preço de venda.
  const changePurchase = (value: string) => {
    setPurchase(value);
    setProfit(fmt(num(sale) - num(value)));
  };

  const changeSale = (value: string) => {
    setSale(value);
    setProfit(fmt(num(value) - num(purchase)));
  };

  const changeProfit = (value: string) => {
    setProfit(value);
    setSale(fmt(num(purchase) + num(value)));
  };

  const delta = num(quantity) - product.quantity;

  const submit = () => {
    const values = {
      quantity: num(quantity),
      purchase_price: num(purchase),
      sale_price: num(sale),
    };
    if (values.quantity < 0) {
      toast.error("A quantidade não pode ser negativa");
      return;
    }
    if (values.purchase_price < 0 || values.sale_price < 0) {
      toast.error("Os preços não podem ser negativos");
      return;
    }
    onSubmit(values);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/25 px-6">
      <form
        className="paper-panel w-full max-w-md p-6"
        style={{ boxShadow: "var(--shadow-lift)" }}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <p className="label-caps">Editar produto</p>
        <h2 className="mt-2 text-2xl">{product.name}</h2>
        <p className="font-mono text-xs text-muted-foreground">{product.sku}</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label-caps" htmlFor="edit-quantity">
              Quantidade em estoque
            </label>
            <input
              id="edit-quantity"
              type="number"
              step="1"
              min="0"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              autoFocus
              className={`mt-2 ${inputClass}`}
            />
            {delta !== 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {delta > 0 ? "Entrada" : "Baixa"} de {qty(Math.abs(delta))} un. registrada como ajuste no histórico —
                não entra no lucro.
              </p>
            ) : null}
          </div>

          <div>
            <label className="label-caps" htmlFor="edit-purchase">
              Valor de compra
            </label>
            <input
              id="edit-purchase"
              type="number"
              step="0.01"
              min="0"
              value={purchase}
              onChange={(event) => changePurchase(event.target.value)}
              className={`mt-2 ${inputClass}`}
            />
          </div>

          <div>
            <label className="label-caps" htmlFor="edit-sale">
              Valor de venda
            </label>
            <input
              id="edit-sale"
              type="number"
              step="0.01"
              min="0"
              value={sale}
              onChange={(event) => changeSale(event.target.value)}
              className={`mt-2 ${inputClass}`}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label-caps" htmlFor="edit-profit">
              Lucro unitário
            </label>
            <input
              id="edit-profit"
              type="number"
              step="0.01"
              value={profit}
              onChange={(event) => changeProfit(event.target.value)}
              className={`mt-2 ${inputClass}`}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Ajustar o lucro recalcula o valor de venda. Total em estoque: {currency(num(quantity) * num(purchase))} de
              custo.
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border-strong px-4 py-2 text-sm transition-colors hover:bg-secondary"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
