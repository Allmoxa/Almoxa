export const currency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

export const qty = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value || 0);

export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );

export const slugSku = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20) || "ITEM";

export type Product = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  purchase_price: number;
  sale_price: number;
  notes: string | null;
  created_at: string;
};

export type Movement = {
  id: string;
  product_id: string;
  kind: "in" | "out";
  quantity: number;
  unit_price: number;
  unit_cost: number;
  source: "manual" | "photo" | "document" | "adjustment";
  note: string | null;
  created_at: string;
  products?: { name: string; sku: string } | null;
};

/** Saída registrada como venda — ajustes de estoque ficam de fora. */
export type Sale = Pick<Movement, "product_id" | "quantity" | "unit_price" | "unit_cost" | "created_at">;

export type ProfitSummary = {
  today: number;
  week: number;
  total: number;
  unitsToday: number;
  unitsWeek: number;
  unitsTotal: number;
};

const emptyProfit: ProfitSummary = {
  today: 0,
  week: 0,
  total: 0,
  unitsToday: 0,
  unitsWeek: 0,
  unitsTotal: 0,
};

export const saleProfit = (sale: Sale) => (sale.unit_price - sale.unit_cost) * sale.quantity;

/** Hoje começa à meia-noite local; a semana é a janela dos últimos 7 dias, hoje incluído. */
export const profitBoundaries = (now: Date = new Date()) => {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(dayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  return { dayStart: dayStart.getTime(), weekStart: weekStart.getTime() };
};

export function profitSummary(sales: Sale[], now: Date = new Date()): ProfitSummary {
  const { dayStart, weekStart } = profitBoundaries(now);
  return sales.reduce<ProfitSummary>(
    (acc, sale) => {
      const profit = saleProfit(sale);
      const at = new Date(sale.created_at).getTime();
      acc.total += profit;
      acc.unitsTotal += sale.quantity;
      if (at >= weekStart) {
        acc.week += profit;
        acc.unitsWeek += sale.quantity;
      }
      if (at >= dayStart) {
        acc.today += profit;
        acc.unitsToday += sale.quantity;
      }
      return acc;
    },
    { ...emptyProfit },
  );
}

export function profitByProduct(sales: Sale[], now: Date = new Date()): Map<string, ProfitSummary> {
  const grouped = new Map<string, Sale[]>();
  for (const sale of sales) {
    const list = grouped.get(sale.product_id);
    if (list) list.push(sale);
    else grouped.set(sale.product_id, [sale]);
  }
  return new Map([...grouped].map(([productId, list]) => [productId, profitSummary(list, now)]));
}

export const noProfit = (): ProfitSummary => ({ ...emptyProfit });
