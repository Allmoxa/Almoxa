import { isRealSale, type Movement, type Product } from "@/lib/inventory";

/**
 * Regras de negócio do dashboard, centralizadas aqui pra não duplicar entre
 * os cards, os gráficos e as listas — todos leem os mesmos números.
 */

/** Estoque baixo: mesma regra que já existia no dashboard (LOW_STOCK_THRESHOLD). */
export const LOW_STOCK_THRESHOLD = 5;

/**
 * Estoque em excesso: não existia regra de negócio pra isso no projeto.
 * Heurística inicial e configurável — ajuste este número se o negócio
 * definir um critério próprio (por giro, por categoria etc.).
 */
export const EXCESS_STOCK_THRESHOLD = 50;

/** "Produtos parados" sem override do filtro avançado usa este padrão (era fixo no dashboard antes). */
export const DEFAULT_STALLED_DAYS = 30;

/** Período padrão do dashboard ao carregar — preserva o comportamento atual. */
export const DEFAULT_FLOW_DAYS = 14;

/** Não deixa o gráfico de fluxo virar uma faixa de centenas de barras num período personalizado enorme. */
const MAX_FLOW_BUCKETS = 90;

const DAY_MS = 86_400_000;

export type PeriodPreset = "today" | "7d" | "14d" | "30d" | "month" | "lastMonth" | "custom";

export type StockStatus = "all" | "normal" | "low" | "zero" | "excess";

export type MovementTypeFilter = "all" | "in" | "out";

export type ValueType = "cost" | "sale" | "profit";

export type SortBy =
  | "default"
  | "topSelling"
  | "leastSelling"
  | "mostProfit"
  | "leastProfit"
  | "mostStock"
  | "leastStock"
  | "name";

export type DashboardFilters = {
  period: { preset: PeriodPreset; startDate: string | null; endDate: string | null };
  productIds: string[];
  stockStatus: StockStatus;
  movementType: MovementTypeFilter;
  inactiveDays: number | null;
  valueType: ValueType | null;
  minValue: number | null;
  maxValue: number | null;
  sortBy: SortBy;
};

export const DEFAULT_FILTERS: DashboardFilters = {
  period: { preset: "14d", startDate: null, endDate: null },
  productIds: [],
  stockStatus: "all",
  movementType: "all",
  inactiveDays: null,
  valueType: null,
  minValue: null,
  maxValue: null,
  sortBy: "default",
};

// ---------------------------------------------------------------------------
// Datas — tudo em horário local. Nunca via toISOString()/parsing de string
// "YYYY-MM-DD" pelo construtor de Date direto: os dois passam por UTC e
// podem deslocar um dia inteiro em fusos negativos como o do Brasil.
// ---------------------------------------------------------------------------

/** "YYYY-MM-DD" (o formato de <input type="date">) -> meia-noite local daquele dia. */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Meia-noite local -> "YYYY-MM-DD", pro valor de <input type="date">. */
export function toLocalDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export type DateRange = { start: Date; end: Date };

/** Intervalo [start, end] em horário local a partir do preset escolhido. */
export function getPeriodRange(
  period: DashboardFilters["period"],
  now: Date = new Date(),
): DateRange | null {
  const today = startOfDay(now);
  const endToday = endOfDay(now);

  switch (period.preset) {
    case "today":
      return { start: today, end: endToday };
    case "7d": {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { start, end: endToday };
    }
    case "14d": {
      const start = new Date(today);
      start.setDate(start.getDate() - 13);
      return { start, end: endToday };
    }
    case "30d": {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { start, end: endToday };
    }
    case "month":
      return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: endToday };
    case "lastMonth": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = endOfDay(new Date(today.getFullYear(), today.getMonth(), 0));
      return { start, end };
    }
    case "custom": {
      if (!period.startDate || !period.endDate) return null;
      const start = startOfDay(parseLocalDate(period.startDate));
      const rawEnd = endOfDay(parseLocalDate(period.endDate));
      // A data final não pode ser anterior à inicial — se a UI deixar passar,
      // a conta não quebra: o intervalo colapsa pro próprio dia inicial.
      const end = rawEnd < start ? endOfDay(start) : rawEnd;
      return { start, end };
    }
    default:
      return null;
  }
}

function isWithinRange(dateIso: string, range: DateRange | null): boolean {
  if (!range) return true;
  const t = new Date(dateIso).getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}

// ---------------------------------------------------------------------------
// Situação de estoque
// ---------------------------------------------------------------------------

export function getStockStatus(product: Pick<Product, "quantity">): Exclude<StockStatus, "all"> {
  if (product.quantity <= 0) return "zero";
  if (product.quantity <= LOW_STOCK_THRESHOLD) return "low";
  if (product.quantity >= EXCESS_STOCK_THRESHOLD) return "excess";
  return "normal";
}

function matchesStockStatus(product: Pick<Product, "quantity">, filter: StockStatus): boolean {
  return filter === "all" || getStockStatus(product) === filter;
}

// ---------------------------------------------------------------------------
// Produtos parados
// ---------------------------------------------------------------------------

export type StalledProduct = Product & { lastOut: number | null };

/**
 * Última venda real por produto, olhando o histórico completo — não o
 * período filtrado. Se olhasse só o período, escolher "hoje" faria um
 * produto que vendeu ontem parecer "nunca saiu".
 */
function lastSaleByProduct(movements: Movement[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of movements) {
    if (!isRealSale(m)) continue;
    const t = new Date(m.created_at).getTime();
    const prev = map.get(m.product_id) ?? 0;
    if (t > prev) map.set(m.product_id, t);
  }
  return map;
}

export function getStalledProducts(
  products: Product[],
  allMovements: Movement[],
  inactiveDays: number,
  now: Date = new Date(),
): StalledProduct[] {
  const lastOutByProduct = lastSaleByProduct(allMovements);
  const thresholdMs = inactiveDays * DAY_MS;
  return products
    .filter((p) => p.quantity > 0)
    .map((p) => ({ ...p, lastOut: lastOutByProduct.get(p.id) ?? null }))
    .filter((p) => !p.lastOut || now.getTime() - p.lastOut > thresholdMs)
    .sort((a, b) => (a.lastOut ?? 0) - (b.lastOut ?? 0));
}

// ---------------------------------------------------------------------------
// Faixa de valor
// ---------------------------------------------------------------------------

function matchesValueRange(value: number, minValue: number | null, maxValue: number | null): boolean {
  if (minValue != null && value < minValue) return false;
  if (maxValue != null && value > maxValue) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Agregados por produto e ordenação
// ---------------------------------------------------------------------------

export type ProductAggregate = {
  id: string;
  name: string;
  quantity: number;
  qtySold: number;
  profit: number;
};

function sortAggregates(aggregates: ProductAggregate[], sortBy: SortBy): ProductAggregate[] {
  const list = [...aggregates];
  switch (sortBy) {
    case "leastSelling":
      return list.sort((a, b) => a.qtySold - b.qtySold);
    case "mostProfit":
      return list.sort((a, b) => b.profit - a.profit);
    case "leastProfit":
      return list.sort((a, b) => a.profit - b.profit);
    case "mostStock":
      return list.sort((a, b) => b.quantity - a.quantity);
    case "leastStock":
      return list.sort((a, b) => a.quantity - b.quantity);
    case "name":
      return list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    case "topSelling":
      return list.sort((a, b) => b.qtySold - a.qtySold);
    default:
      return list;
  }
}

// ---------------------------------------------------------------------------
// Função central — todo indicador, gráfico e lista do dashboard passa por
// aqui. Ninguém mais filtra os mesmos dados por conta própria.
// ---------------------------------------------------------------------------

export type DashboardStats = {
  totalInvested: number;
  avgTicket: number;
  lowStock: Product[];
  stalled: StalledProduct[];
  topSellers: { name: string; qty: number }[];
  topProfit: { name: string; profit: number }[];
  flow: { date: string; label: string; entradas: number; saidas: number }[];
  filteredProductCount: number;
  filteredMovementCount: number;
};

export function computeDashboardStats(
  products: Product[],
  movements: Movement[],
  filters: DashboardFilters,
  { now = new Date() }: { now?: Date } = {},
): DashboardStats {
  const range = getPeriodRange(filters.period, now);

  // 1) produtos elegíveis pelos filtros diretos (seleção de produto, situação de estoque) — grupos combinam em AND.
  let eligibleProducts = products.filter(
    (p) =>
      (filters.productIds.length === 0 || filters.productIds.includes(p.id)) &&
      matchesStockStatus(p, filters.stockStatus),
  );

  // 2) movimentações desses produtos, por tipo e depois por período.
  const eligibleIdsStep1 = new Set(eligibleProducts.map((p) => p.id));
  const productScopedMovements = movements.filter((m) => eligibleIdsStep1.has(m.product_id));
  const typeScopedMovements =
    filters.movementType === "all"
      ? productScopedMovements
      : productScopedMovements.filter((m) => m.kind === filters.movementType);
  const periodMovements = typeScopedMovements.filter((m) => isWithinRange(m.created_at, range));

  // 3) agregados por produto (vendas reais dentro do período) — precisam existir antes da faixa de valor por lucro.
  const outMovements = periodMovements.filter(isRealSale);
  const productById = new Map(products.map((p) => [p.id, p]));
  const aggByProduct = new Map<string, ProductAggregate>();
  for (const p of eligibleProducts) {
    aggByProduct.set(p.id, { id: p.id, name: p.name, quantity: p.quantity, qtySold: 0, profit: 0 });
  }
  for (const m of outMovements) {
    const agg = aggByProduct.get(m.product_id);
    if (!agg) continue;
    const product = productById.get(m.product_id);
    agg.qtySold += m.quantity;
    // O custo é o congelado na venda: mudar o preço de compra hoje não reescreve o passado.
    agg.profit += (m.unit_price - (m.unit_cost || product?.purchase_price || 0)) * m.quantity;
  }

  // 4) faixa de valor — mais uma restrição de produto, em AND com as anteriores.
  if (filters.valueType && (filters.minValue != null || filters.maxValue != null)) {
    eligibleProducts = eligibleProducts.filter((p) => {
      const value =
        filters.valueType === "cost"
          ? p.purchase_price
          : filters.valueType === "sale"
            ? p.sale_price
            : (aggByProduct.get(p.id)?.profit ?? 0);
      return matchesValueRange(value, filters.minValue, filters.maxValue);
    });
  }

  const finalIds = new Set(eligibleProducts.map((p) => p.id));
  const finalPeriodMovements = periodMovements.filter((m) => finalIds.has(m.product_id));
  const finalOutMovements = finalPeriodMovements.filter(isRealSale);
  const finalAggregates = [...aggByProduct.values()].filter((a) => finalIds.has(a.id));

  // Indicadores
  const totalInvested = eligibleProducts.reduce((sum, p) => sum + p.purchase_price * p.quantity, 0);
  const avgTicket = finalOutMovements.length
    ? finalOutMovements.reduce((sum, m) => sum + m.unit_price * m.quantity, 0) / finalOutMovements.length
    : 0;

  const lowStock = [...eligibleProducts]
    .filter((p) => getStockStatus(p) === "low")
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 8);

  const inactiveDays = filters.inactiveDays ?? DEFAULT_STALLED_DAYS;
  // Parados olha o histórico completo dos produtos já restritos por
  // produto/estoque/tipo — não o período filtrado (ver lastSaleByProduct).
  const stalled = getStalledProducts(eligibleProducts, productScopedMovements, inactiveDays, now).slice(
    0,
    8,
  );

  // Só produtos que de fato venderam no período entram nos rankings — como
  // antes, quando o mapa só existia a partir das saídas reais. Sem isso,
  // produto sem venda nenhuma apareceria como uma barra de valor zero.
  const soldAggregates = finalAggregates.filter((a) => a.qtySold > 0);
  const useDefaultSort = filters.sortBy === "default";
  const sellersSorted = sortAggregates(soldAggregates, useDefaultSort ? "topSelling" : filters.sortBy);
  const profitSorted = sortAggregates(soldAggregates, useDefaultSort ? "mostProfit" : filters.sortBy);
  const topSellers = sellersSorted.slice(0, 6).map((a) => ({ name: a.name, qty: a.qtySold }));
  const topProfit = profitSorted.slice(0, 6).map((a) => ({ name: a.name, profit: a.profit }));

  const flow = buildFlowSeries(finalPeriodMovements, range, now);

  return {
    totalInvested,
    avgTicket,
    lowStock,
    stalled,
    topSellers,
    topProfit,
    flow,
    filteredProductCount: eligibleProducts.length,
    filteredMovementCount: finalPeriodMovements.length,
  };
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildFlowSeries(
  movements: Movement[],
  range: DateRange | null,
  now: Date,
): DashboardStats["flow"] {
  const end = range ? range.end : now;
  // floor, não round: start é sempre meia-noite e end sempre 23:59:59.999,
  // então a divisão nunca fecha num número inteiro — arredondar somaria um
  // dia a mais em todo período (ex.: "14 dias" virava 15 buckets).
  const spanDays = range
    ? Math.max(1, Math.floor((range.end.getTime() - range.start.getTime()) / DAY_MS) + 1)
    : DEFAULT_FLOW_DAYS;
  const bucketDays = Math.min(spanDays, MAX_FLOW_BUCKETS);

  const dayFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
  const flow: DashboardStats["flow"] = [];
  for (let i = bucketDays - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * DAY_MS);
    flow.push({ date: localDateKey(d), label: dayFormatter.format(d), entradas: 0, saidas: 0 });
  }
  const flowByDate = new Map(flow.map((b) => [b.date, b]));
  for (const m of movements) {
    const bucket = flowByDate.get(localDateKey(new Date(m.created_at)));
    if (!bucket) continue;
    if (m.kind === "in") bucket.entradas += m.quantity;
    else bucket.saidas += m.quantity;
  }
  return flow;
}

// ---------------------------------------------------------------------------
// URL <-> filtros. Chaves compactas, só aparecem na URL quando diferem do
// padrão — assim um dashboard sem filtro nenhum continua com a URL limpa.
// ---------------------------------------------------------------------------

const PERIOD_PRESETS: PeriodPreset[] = ["today", "7d", "14d", "30d", "month", "lastMonth", "custom"];
const STOCK_STATUSES: StockStatus[] = ["all", "normal", "low", "zero", "excess"];
const MOVEMENT_TYPES: MovementTypeFilter[] = ["all", "in", "out"];
const VALUE_TYPES: ValueType[] = ["cost", "sale", "profit"];
const SORT_OPTIONS: SortBy[] = [
  "default",
  "topSelling",
  "leastSelling",
  "mostProfit",
  "leastProfit",
  "mostStock",
  "leastStock",
  "name",
];

export type DashboardSearch = {
  period?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  products?: string | undefined;
  stock?: string | undefined;
  movement?: string | undefined;
  inactive?: string | undefined;
  valueType?: string | undefined;
  min?: string | undefined;
  max?: string | undefined;
  sort?: string | undefined;
};

/** Nunca lança em cima de URL malformada/antiga — o que não dá pra entender vira o padrão daquele campo. */
export function searchToFilters(search: DashboardSearch): DashboardFilters {
  const preset = PERIOD_PRESETS.includes(search.period as PeriodPreset)
    ? (search.period as PeriodPreset)
    : DEFAULT_FILTERS.period.preset;

  const inactiveDays = search.inactive ? Number(search.inactive) : NaN;
  const minValue = search.min ? Number(search.min) : NaN;
  const maxValue = search.max ? Number(search.max) : NaN;

  return {
    period: {
      preset,
      startDate: preset === "custom" && search.from ? search.from : null,
      endDate: preset === "custom" && search.to ? search.to : null,
    },
    productIds: search.products ? search.products.split(",").filter(Boolean) : [],
    stockStatus: STOCK_STATUSES.includes(search.stock as StockStatus)
      ? (search.stock as StockStatus)
      : "all",
    movementType: MOVEMENT_TYPES.includes(search.movement as MovementTypeFilter)
      ? (search.movement as MovementTypeFilter)
      : "all",
    inactiveDays: Number.isFinite(inactiveDays) ? inactiveDays : null,
    valueType: VALUE_TYPES.includes(search.valueType as ValueType) ? (search.valueType as ValueType) : null,
    minValue: Number.isFinite(minValue) ? minValue : null,
    maxValue: Number.isFinite(maxValue) ? maxValue : null,
    sortBy: SORT_OPTIONS.includes(search.sort as SortBy) ? (search.sort as SortBy) : "default",
  };
}

export function filtersToSearch(filters: DashboardFilters): DashboardSearch {
  const search: DashboardSearch = {};
  if (filters.period.preset !== DEFAULT_FILTERS.period.preset) search.period = filters.period.preset;
  if (filters.period.preset === "custom") {
    if (filters.period.startDate) search.from = filters.period.startDate;
    if (filters.period.endDate) search.to = filters.period.endDate;
  }
  if (filters.productIds.length > 0) search.products = filters.productIds.join(",");
  if (filters.stockStatus !== "all") search.stock = filters.stockStatus;
  if (filters.movementType !== "all") search.movement = filters.movementType;
  if (filters.inactiveDays != null) search.inactive = String(filters.inactiveDays);
  if (filters.valueType) search.valueType = filters.valueType;
  if (filters.minValue != null) search.min = String(filters.minValue);
  if (filters.maxValue != null) search.max = String(filters.maxValue);
  if (filters.sortBy !== "default") search.sort = filters.sortBy;
  return search;
}

/** Quantos filtros avançados (painel lateral) estão ativos — pro contador no botão "Mais filtros". */
export function countAdvancedFilters(filters: DashboardFilters): number {
  let count = 0;
  if (filters.movementType !== "all") count += 1;
  if (filters.inactiveDays != null) count += 1;
  if (filters.valueType && (filters.minValue != null || filters.maxValue != null)) count += 1;
  if (filters.sortBy !== "default") count += 1;
  return count;
}

export function hasAnyActiveFilter(filters: DashboardFilters): boolean {
  return (
    filters.period.preset !== DEFAULT_FILTERS.period.preset ||
    filters.productIds.length > 0 ||
    filters.stockStatus !== "all" ||
    countAdvancedFilters(filters) > 0
  );
}
