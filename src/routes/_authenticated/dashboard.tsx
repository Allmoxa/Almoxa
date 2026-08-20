import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { requireOwner } from "@/lib/guards";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { DashboardFilterBar, PERIOD_LABELS } from "@/components/dashboard-filter-bar";
import { DashboardAdvancedFilters } from "@/components/dashboard-advanced-filters";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { supabase } from "@/integrations/supabase/client";
import { currency, dateTime, qty, type Movement, type Product } from "@/lib/inventory";
import {
  computeDashboardStats,
  DEFAULT_FILTERS,
  filtersToSearch,
  hasAnyActiveFilter,
  searchToFilters,
  type DashboardFilters as DashboardFiltersType,
  type DashboardSearch,
} from "@/lib/dashboard-filters";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Almoxá" },
      {
        name: "description",
        content: "Visão geral do negócio: estoque baixo, mais vendidos, lucro e movimentação.",
      },
    ],
  }),
  beforeLoad: requireOwner,
  validateSearch: (search: Record<string, unknown>): DashboardSearch => {
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    return {
      period: str(search["period"]),
      from: str(search["from"]),
      to: str(search["to"]),
      products: str(search["products"]),
      stock: str(search["stock"]),
      movement: str(search["movement"]),
      inactive: str(search["inactive"]),
      valueType: str(search["valueType"]),
      min: str(search["min"]),
      max: str(search["max"]),
      sort: str(search["sort"]),
    };
  },
  component: DashboardPage,
});

// Antes só os últimos 300 lançamentos vinham pro navegador — suficiente
// quando não havia como escolher um período maior que "últimos 14 dias".
// Com o filtro de período liberando janelas maiores (ex.: mês anterior,
// personalizado), o limite subiu para não cortar movimentações antigas que
// o usuário pediu explicitamente pra ver.
const MOVEMENTS_LIMIT = 1000;

function DashboardPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const reducedMotion = usePrefersReducedMotion();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedTriggerRef = useRef<HTMLButtonElement>(null);

  const filters = useMemo(() => searchToFilters(search), [search]);

  const setFilters = (next: DashboardFiltersType) => {
    navigate({ search: filtersToSearch(next), replace: true, resetScroll: false });
  };

  const closeAdvanced = () => {
    setAdvancedOpen(false);
    // Garantia explícita além do retorno de foco padrão do Radix Dialog.
    advancedTriggerRef.current?.focus();
  };

  const {
    data: products = [],
    isLoading: loadingProducts,
    isError: productsError,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, sku, quantity, purchase_price, sale_price, notes, created_at, is_ingredient",
        )
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const {
    data: movements = [],
    isLoading: loadingMovements,
    isError: movementsError,
    refetch: refetchMovements,
  } = useQuery({
    queryKey: ["movements", MOVEMENTS_LIMIT],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movements")
        .select(
          "id, product_id, kind, quantity, unit_price, unit_cost, source, note, created_at, reverses_id, reversed_at, products(name, sku)",
        )
        .order("created_at", { ascending: false })
        .limit(MOVEMENTS_LIMIT);
      if (error) throw error;
      return data as Movement[];
    },
  });

  const isLoading = loadingProducts || loadingMovements;
  const hasError = productsError || movementsError;
  const hasAnyData = products.length > 0 || movements.length > 0;
  const stats = useMemo(
    () => computeDashboardStats(products, movements, filters),
    [products, movements, filters],
  );

  const activeFilters = hasAnyActiveFilter(filters);
  const noResults = !isLoading && activeFilters && stats.filteredProductCount === 0;

  const retry = () => {
    refetchProducts();
    refetchMovements();
  };

  const periodLabel = PERIOD_LABELS[filters.period.preset];

  return (
    <AppShell
      title="Dashboard"
      description="Visão geral do seu negócio: estoque, vendas e tendências."
    >
      <div className="theme-dashboard -mx-4 rounded-3xl bg-background px-5 py-8 sm:-mx-6 sm:px-8">
        <div aria-live="polite" className="sr-only">
          {!isLoading && !hasError
            ? `${stats.filteredProductCount} produtos e ${stats.filteredMovementCount} movimentações encontrados.`
            : null}
        </div>

        {isLoading ? (
          <DashboardSkeleton />
        ) : hasError && !hasAnyData ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar o dashboard agora.
            </p>
            <Button type="button" variant="outline" onClick={retry}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {hasError ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
                <span>
                  Não foi possível atualizar os dados agora. Mostrando o último resultado válido.
                </span>
                <Button type="button" variant="outline" size="sm" onClick={retry}>
                  Tentar novamente
                </Button>
              </div>
            ) : null}

            <DashboardFilterBar
              filters={filters}
              onChange={setFilters}
              products={products}
              advancedOpen={advancedOpen}
              onAdvancedOpenChange={(open) => (open ? setAdvancedOpen(true) : closeAdvanced())}
              advancedTriggerRef={advancedTriggerRef}
            />

            {noResults ? (
              <div className="paper-panel flex flex-col items-center gap-3 py-16 text-center">
                <p className="text-sm text-muted-foreground">
                  Nenhum resultado encontrado com estes filtros.
                </p>
                <Button type="button" variant="outline" onClick={() => setFilters(DEFAULT_FILTERS)}>
                  Limpar filtros
                </Button>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    delay={0}
                    label="Investido em estoque"
                    value={stats.totalInvested}
                    format={currency}
                  />
                  <StatCard
                    delay={80}
                    label="Ticket médio de saída"
                    value={stats.avgTicket}
                    format={currency}
                  />
                  <StatCard
                    delay={160}
                    label="Produtos com estoque baixo"
                    value={stats.lowStock.length}
                    warn={stats.lowStock.length > 0}
                    targetId="lista-estoque-baixo"
                  />
                  <StatCard
                    delay={240}
                    label="Produtos parados"
                    value={stats.stalled.length}
                    warn={stats.stalled.length > 0}
                    targetId="lista-produtos-parados"
                  />
                </div>

                <ChartCard delay={320} title="Entradas x Saídas" subtitle={periodLabel}>
                  <FlowChart data={stats.flow} reducedMotion={reducedMotion} />
                </ChartCard>

                <div className="grid gap-6 lg:grid-cols-2">
                  <ChartCard
                    delay={400}
                    title="Mais vendidos"
                    subtitle="Unidades saídas do estoque"
                  >
                    <RankingChart
                      data={stats.topSellers}
                      dataKey="qty"
                      valueFormat={qty}
                      color="var(--chart-1)"
                      reducedMotion={reducedMotion}
                    />
                  </ChartCard>

                  <ChartCard
                    delay={480}
                    title="Lucro por produto"
                    subtitle="Realizado nas vendas registradas"
                  >
                    <RankingChart
                      data={stats.topProfit}
                      dataKey="profit"
                      valueFormat={currency}
                      color="var(--chart-2)"
                      reducedMotion={reducedMotion}
                    />
                  </ChartCard>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <ListCard
                    id="lista-estoque-baixo"
                    delay={560}
                    title="Estoque baixo"
                    empty="Nenhum produto abaixo do mínimo."
                  >
                    {stats.lowStock.map((p, i) => (
                      <ListRow key={p.id} delay={i * 60}>
                        <span className="truncate">{p.name}</span>
                        <span className="font-mono text-xs text-destructive">
                          {qty(p.quantity)} un.
                        </span>
                      </ListRow>
                    ))}
                  </ListCard>

                  <ListCard
                    id="lista-produtos-parados"
                    delay={640}
                    title="Produtos parados"
                    empty="Tudo girando no período considerado."
                  >
                    {stats.stalled.map((p, i) => (
                      <ListRow key={p.id} delay={i * 60}>
                        <span className="truncate">{p.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.lastOut ? dateTime(new Date(p.lastOut).toISOString()) : "Nunca saiu"}
                        </span>
                      </ListRow>
                    ))}
                  </ListCard>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <DashboardAdvancedFilters
        open={advancedOpen}
        onOpenChange={(open) => (open ? setAdvancedOpen(true) : closeAdvanced())}
        filters={filters}
        onApply={setFilters}
      />
    </AppShell>
  );
}

function scrollToTarget(targetId: string) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background");
  window.setTimeout(() => {
    el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background");
  }, 1400);
}

function StatCard({
  label,
  value,
  format = (n: number) => Math.round(n).toString(),
  delay = 0,
  warn = false,
  targetId,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  delay?: number;
  warn?: boolean;
  targetId?: string;
}) {
  const clickable = !!targetId && value > 0;

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => scrollToTarget(targetId) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") scrollToTarget(targetId);
            }
          : undefined
      }
      className={`paper-panel animate-card-rise w-full p-5 text-left transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg ${
        warn ? "animate-soft-pulse border-destructive/50" : ""
      } ${clickable ? "cursor-pointer" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="label-caps">{label}</p>
      <p className="mt-3 font-display text-3xl">
        <AnimatedNumber value={value} format={format} />
      </p>
      {clickable ? <p className="mt-1 text-xs text-muted-foreground">Ver quais →</p> : null}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  delay = 0,
  children,
}: {
  title: string;
  subtitle?: string;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="paper-panel animate-card-rise p-6 transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg"
      style={{ animationDelay: `${delay}ms` }}
    >
      <h3 className="font-display text-lg">{title}</h3>
      {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ListCard({
  id,
  title,
  empty,
  delay = 0,
  children,
}: {
  id?: string;
  title: string;
  empty: string;
  delay?: number;
  children: ReactNode[];
}) {
  return (
    <div
      id={id}
      className="paper-panel animate-card-rise scroll-mt-24 p-6 transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg"
      style={{ animationDelay: `${delay}ms` }}
    >
      <h3 className="font-display text-lg">{title}</h3>
      <div className="mt-4 divide-y divide-border">
        {children.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">{empty}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function ListRow({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <div
      className="animate-step-fade flex items-center justify-between gap-4 py-2.5 text-sm"
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// Entre 250-400ms pedidos pro update dos filtros — bem mais curto que os
// 900ms de antes, que eram pensados só pra animação de entrada inicial.
const CHART_TRANSITION_MS = 300;

function FlowChart({
  data,
  reducedMotion,
}: {
  data: { label: string; entradas: number; saidas: number }[];
  reducedMotion: boolean;
}) {
  const config: ChartConfig = {
    entradas: { label: "Entradas", color: "var(--chart-1)" },
    saidas: { label: "Saídas", color: "var(--chart-5)" },
  };

  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <LineChart data={data} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          interval="preserveStartEnd"
        />
        <YAxis tickLine={false} axisLine={false} fontSize={11} width={30} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          type="monotone"
          dataKey="entradas"
          stroke="var(--color-entradas)"
          strokeWidth={2.5}
          dot={false}
          isAnimationActive={!reducedMotion}
          animationDuration={CHART_TRANSITION_MS}
        />
        <Line
          type="monotone"
          dataKey="saidas"
          stroke="var(--color-saidas)"
          strokeWidth={2.5}
          dot={false}
          isAnimationActive={!reducedMotion}
          animationDuration={CHART_TRANSITION_MS}
        />
      </LineChart>
    </ChartContainer>
  );
}

function RankingChart({
  data,
  dataKey,
  valueFormat,
  color,
  reducedMotion,
}: {
  data: { name: string; qty?: number; profit?: number }[];
  dataKey: "qty" | "profit";
  valueFormat: (n: number) => string;
  color: string;
  reducedMotion: boolean;
}) {
  const config: ChartConfig = {
    [dataKey]: { label: dataKey === "qty" ? "Unidades" : "Lucro", color },
  };

  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">Sem movimentações ainda.</p>
    );
  }

  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          tickFormatter={valueFormat}
        />
        <YAxis
          type="category"
          dataKey="name"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          width={110}
        />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => valueFormat(Number(v))} />} />
        <Bar
          dataKey={dataKey}
          fill={`var(--color-${dataKey})`}
          radius={4}
          isAnimationActive={!reducedMotion}
          animationDuration={CHART_TRANSITION_MS}
        />
      </BarChart>
    </ChartContainer>
  );
}
