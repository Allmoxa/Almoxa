import { useState } from "react";
import { toast } from "sonner";
import { currency, qty, type Product } from "@/lib/inventory";

export type MovementValues = {
  quantity: number;
  unit_price: number;
};

type Props = {
  product: Product;
  kind: "in" | "out";
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: MovementValues) => void;
};

const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring";

const num = (value: string) => {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function ProductMovementDialog({ product, kind, pending, onCancel, onSubmit }: Props) {
  const isSale = kind === "out";
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState(String(isSale ? product.sale_price : product.purchase_price));

  const quantityValue = num(quantity);
  const priceValue = num(price);
  const profit = (priceValue - product.purchase_price) * quantityValue;
  const missingStock = isSale && quantityValue > product.quantity;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/25 px-6">
      <form
        className="paper-panel w-full max-w-sm p-6"
        style={{ boxShadow: "var(--shadow-lift)" }}
        onSubmit={(event) => {
          event.preventDefault();
          if (quantityValue <= 0) {
            toast.error("Quantidade inválida");
            return;
          }
          onSubmit({ quantity: quantityValue, unit_price: priceValue });
        }}
      >
        <p className="label-caps">{isSale ? "Registrar venda" : "Entrada"}</p>
        <h2 className="mt-2 text-2xl">{product.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Em estoque: {qty(product.quantity)}</p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="label-caps" htmlFor="mv-quantity">
              Quantidade
            </label>
            <input
              id="mv-quantity"
              type="number"
              step="1"
              min="0"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              autoFocus
              className={`mt-2 ${inputClass}`}
            />
          </div>
          <div>
            <label className="label-caps" htmlFor="mv-price">
              {isSale ? "Valor de venda unitário" : "Preço unitário"}
            </label>
            <input
              id="mv-price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className={`mt-2 ${inputClass}`}
            />
          </div>
        </div>

        {isSale ? (
          <div className="mt-5 flex items-baseline justify-between border-t border-border pt-4">
            <div>
              <p className="label-caps">Lucro da venda</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {currency(priceValue)} − {currency(product.purchase_price)} de custo
              </p>
            </div>
            <p className={`font-display text-xl tabular-nums ${profit < 0 ? "text-destructive" : "text-success"}`}>
              {currency(profit)}
            </p>
          </div>
        ) : null}

        {missingStock ? (
          <p className="mt-4 text-xs text-destructive">
            Estoque insuficiente: há {qty(product.quantity)} un. disponíveis.
          </p>
        ) : null}

        <div className="mt-6 flex gap-2">
          <button
            type="submit"
            disabled={pending || missingStock}
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Confirmar
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
