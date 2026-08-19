export const currency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

export const qty = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value || 0);

export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

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

export type MovementSource = "manual" | "photo" | "document" | "adjustment" | "reversal";

export type Movement = {
  id: string;
  product_id: string;
  kind: "in" | "out";
  quantity: number;
  unit_price: number;
  unit_cost: number;
  source: MovementSource;
  note: string | null;
  created_at: string;
  /** Quem apertou o botão — pode ser um comissionado da loja, não o dono. */
  created_by: string | null;
  /** Resolvido pelo painel do onisciente, que alcança auth.users. */
  created_by_email?: string | null;
  /** Quem recebe o crédito da venda — o dono pode lançar em nome de um comissionado. */
  sold_by: string | null;
  /** Resolvido pelo painel do onisciente, que alcança auth.users. */
  sold_by_email?: string | null;
  /** Preenchido na linha do estorno: o lançamento que ele desfaz. */
  reverses_id: string | null;
  /** Preenchido na linha do original assim que alguém a estorna. */
  reversed_at: string | null;
  products?: { name: string; sku: string } | null;
};

/** Saída registrada como venda — ajustes de estoque ficam de fora. */
export type Sale = Pick<
  Movement,
  "product_id" | "quantity" | "unit_price" | "unit_cost" | "created_at"
>;

/** Origens que movem estoque sem ser compra ou venda: correção e desfazimento. */
export const NON_SALE_SOURCES = ["adjustment", "reversal"] as const;

/**
 * O mesmo filtro em sintaxe PostgREST, para as telas que já descartam o que não
 * é venda na consulta em vez de trazer tudo e peneirar no navegador.
 * Acompanha `.is("reversed_at", null)`: a venda estornada também não conta.
 */
export const NON_SALE_SOURCES_FILTER = `(${NON_SALE_SOURCES.join(",")})`;

/**
 * Saída que de fato vendeu: nem ajuste, nem estorno, nem venda já estornada.
 *
 * Estornar uma venda não lança lucro negativo — apaga o lucro que ela gerou.
 * Por isso o original sai da conta junto com o estorno, em vez de os dois se
 * somarem a zero: fosse por soma, as unidades vendidas continuariam contando.
 */
export const isRealSale = (movement: Pick<Movement, "kind" | "source" | "reversed_at">): boolean =>
  movement.kind === "out" &&
  !NON_SALE_SOURCES.includes(movement.source as (typeof NON_SALE_SOURCES)[number]) &&
  !movement.reversed_at;

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

export type PurchaseSuggestion = {
  product: Product;
  /** Unidades vendidas dentro da janela analisada. */
  sold: number;
  /** Média de unidades vendidas por dia. */
  perDay: number;
  /** Dias que o estoque atual ainda cobre; Infinity quando o item não vende. */
  daysLeft: number;
  /** Quanto comprar para cobrir o período pedido, arredondado para cima. */
  suggested: number;
  /** Custo unitário usado na conta — o preço de compra atual do produto. */
  unitCost: number;
};

const DAY_MS = 86_400_000;

/**
 * Monta a lista de recompra a partir do ritmo de venda de cada produto.
 *
 * A média diária divide pelos dias em que o produto existiu, não pela janela
 * inteira: um item cadastrado há três dias que vendeu seis unidades vende duas
 * por dia, não 0,2. Sem esse cuidado todo produto novo pareceria parado e
 * ficaria de fora justamente da primeira compra de reposição.
 *
 * O que não vendeu na janela não entra. A lista é para repor o que gira — o
 * que está encalhado já tem lugar próprio em "produtos parados", no dashboard.
 */
export function purchaseSuggestions(
  products: Product[],
  sales: Sale[],
  {
    windowDays,
    coverDays,
    now = new Date(),
  }: { windowDays: number; coverDays: number; now?: Date },
): PurchaseSuggestion[] {
  const windowStart = now.getTime() - windowDays * DAY_MS;

  const soldByProduct = new Map<string, number>();
  for (const sale of sales) {
    if (new Date(sale.created_at).getTime() < windowStart) continue;
    soldByProduct.set(sale.product_id, (soldByProduct.get(sale.product_id) ?? 0) + sale.quantity);
  }

  return products
    .map((product) => {
      const sold = soldByProduct.get(product.id) ?? 0;
      const age = (now.getTime() - new Date(product.created_at).getTime()) / DAY_MS;
      const observed = Math.max(1, Math.min(windowDays, age));
      const perDay = sold / observed;
      const needed = perDay * coverDays - product.quantity;
      return {
        product,
        sold,
        perDay,
        daysLeft: perDay > 0 ? product.quantity / perDay : Infinity,
        suggested: needed > 0 ? Math.ceil(needed) : 0,
        unitCost: product.purchase_price,
      };
    })
    .filter((item) => item.sold > 0 && item.suggested > 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/** Linha de uma venda em lote: o que saiu e quanto essa saída valeria pela tabela. */
export type SplitLine = {
  quantity: number;
  /** Preço de tabela usado como peso do rateio. Zero = sem referência. */
  reference: number;
};

/** Peso do produto no rateio: o preço de tabela, ou o custo quando não há preço de venda. */
export const splitReference = (product?: Pick<Product, "sale_price" | "purchase_price"> | null) =>
  product ? (product.sale_price > 0 ? product.sale_price : product.purchase_price) : 0;

/**
 * Divide o valor total de uma venda entre as linhas e devolve o valor unitário de cada uma.
 *
 * O peso é quanto a linha valeria pela tabela (preço de venda × quantidade), de modo que
 * um desconto no total cai proporcionalmente sobre os itens mais caros. Sem preço de
 * tabela em nenhuma linha, o rateio passa a ser por unidade — 5 calças por R$ 20 saem a
 * R$ 4,00 cada. A conta roda em centavos e a sobra da divisão vai para as linhas de maior
 * peso, então a soma das linhas bate exatamente com o total informado.
 */
export function splitSaleTotal(lines: SplitLine[], total: number): number[] {
  const entries = lines.map((line) => ({
    quantity: Math.max(0, line.quantity),
    reference: Math.max(0, line.reference),
  }));
  const unitSum = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  if (unitSum <= 0) return lines.map(() => 0);

  const weightSum = entries.reduce((sum, entry) => sum + entry.quantity * entry.reference, 0);
  const base = entries.map((entry) =>
    weightSum > 0 ? entry.quantity * entry.reference : entry.quantity,
  );
  const baseSum = weightSum > 0 ? weightSum : unitSum;

  const totalCents = Math.max(0, Math.round(total * 100));
  const cents = base.map((weight) => Math.floor((totalCents * weight) / baseSum));

  const heaviest = base
    .map((weight, index) => ({ weight, index }))
    .sort((a, b) => b.weight - a.weight);
  let rest = totalCents - cents.reduce((sum, c) => sum + c, 0);
  for (let k = 0; rest > 0; k += 1, rest -= 1) {
    const target = heaviest[k % heaviest.length];
    if (!target) break;
    cents[target.index] = (cents[target.index] ?? 0) + 1;
  }

  return entries.map((entry, index) =>
    entry.quantity > 0 ? Number(((cents[index] ?? 0) / 100 / entry.quantity).toFixed(6)) : 0,
  );
}
