import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { supabase } from "@/integrations/supabase/client";
import { currency, dateTime, qty, type Movement, type Product } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Almoxá" },
      { name: "description", content: "Visão geral do negócio: estoque baixo, mais vendidos, lucro e movimentação." },
    ],
  }),
  component: DashboardPage,
});

const LOW_STOCK_THRESHOLD = 5;
const STALLED_DAYS = 30;
const FLOW_DAYS = 14;

function DashboardPage() {
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, quantity, purchase_price, sale_price, notes, created_at")
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: movements = [], isLoading: loadingMovements } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movements")
        .select("id, product_id, kind, quantity, unit_price, source, note, created_at, products(name, sku)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as Movement[];
    },
  });

  const isLoading = loadingProducts || loadingMovements;
  const stats = useDashboardStats(products, movements);

  return (
    <AppShell title="Dashboard" description="Visão geral do seu negócio: estoque, vendas e tendências.">
      <div className="theme-dashboard -mx-6 rounded-3xl bg-background px-5 py-8 sm:-mx-8 sm:px-8">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 py-24">
            <BoxSpinner size={40} />
            <p className="text-sm text-muted-foreground">Carregando…</p>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard delay={0} label="Investido em estoque" value={stats.totalInvested} format={currency} />
              <StatCard delay={80} label="Ticket médio de saída" value={stats.avgTicket} format={currency} />
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

            <ChartCard delay={320} title="Entradas x Saídas" subtitle={`Últimos ${FLOW_DAYS} dias`}>
              <FlowChart data={stats.flow} />
            </ChartCard>

            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard delay={400} title="Mais vendidos" subtitle="Unidades saídas do estoque">
                <RankingChart data={stats.topSellers} dataKey="qty" valueFormat={qty} color="var(--chart-1)" />
              </ChartCard>

              <ChartCard delay={480} title="Lucro por produto" subtitle="Realizado nas vendas registradas">
                <RankingChart data={stats.topProfit} dataKey="profit" valueFormat={currency} color="var(--chart-2)" />
              </ChartCard>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <ListCard id="lista-estoque-baixo" delay={560} title="Estoque baixo" empty="Nenhum produto abaixo do mínimo.">
                {stats.lowStock.map((p, i) => (
                  <ListRow key={p.id} delay={i * 60}>
                    <span className="truncate">{p.name}</span>
                    <span className="font-mono text-xs text-destructive">{qty(p.quantity)} un.</span>
                  </ListRow>
                ))}
              </ListCard>

              <ListCard
                id="lista-produtos-parados"
                delay={640}
                title="Produtos parados"
                empty={`Tudo girando nos últimos ${STALLED_DAYS} dias.`}
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
          </div>
        )}
      </div>
    </AppShell>
  );
}

function useDashboardStats(products: Product[], movements: Movement[]) {
  return useMemo(() => {
    const now = Date.now();

    const totalInvested = products.reduce((sum, p) => sum + p.purchase_price * p.quantity, 0);

    const outMovements = movements.filter((m) => m.kind === "out");
    const avgTicket = outMovements.length
      ? outMovements.reduce((sum, m) => sum + m.unit_price * m.quantity, 0) / outMovements.length
      : 0;

    const lowStock = [...products]
      .filter((p) => p.quantity <= LOW_STOCK_THRESHOLD)
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 8);

    const productById = new Map(products.map((p) => [p.id, p]));
    const soldByProduct = new Map<string, { name: string; qty: number; profit: number }>();
    for (const m of outMovements) {
      const product = productById.get(m.product_id);
      const name = m.products?.name ?? product?.name ?? "—";
      const entry = soldByProduct.get(m.product_id) ?? { name, qty: 0, profit: 0 };
      entry.qty += m.quantity;
      entry.profit += (m.unit_price - (product?.purchase_price ?? 0)) * m.quantity;
      soldByProduct.set(m.product_id, entry);
    }
    const topSellers = [...soldByProduct.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 6)
      .map((s) => ({ name: s.name, qty: s.qty }));
    const topProfit = [...soldByProduct.values()]
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 6)
      .map((s) => ({ name: s.name, profit: s.profit }));

    const lastOutByProduct = new Map<string, number>();
    for (const m of outMovements) {
      const t = new Date(m.created_at).getTime();
      const prev = lastOutByProduct.get(m.product_id) ?? 0;
      if (t > prev) lastOutByProduct.set(m.product_id, t);
    }
    const stalledMs = STALLED_DAYS * 24 * 60 * 60 * 1000;
    const stalled = products
      .filter((p) => p.quantity > 0)
      .map((p) => ({ ...p, lastOut: lastOutByProduct.get(p.id) ?? null }))
      .filter((p) => !p.lastOut || now - p.lastOut > stalledMs)
      .sort((a, b) => (a.lastOut ?? 0) - (b.lastOut ?? 0))
      .slice(0, 8);

    const dayFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
    const flow: { date: string; label: string; entradas: number; saidas: number }[] = [];
    for (let i = FLOW_DAYS - 1; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      flow.push({ date: d.toISOString().slice(0, 10), label: dayFormatter.format(d), entradas: 0, saidas: 0 });
    }
    const flowByDate = new Map(flow.map((b) => [b.date, b]));
    for (const m of movements) {
      const key = new Date(m.created_at).toISOString().slice(0, 10);
      const bucket = flowByDate.get(key);
      if (!bucket) continue;
      if (m.kind === "in") bucket.entradas += m.quantity;
      else bucket.saidas += m.quantity;
    }

    return { totalInvested, avgTicket, lowStock, topSellers, topProfit, stalled, flow };
  }, [products, movements]);
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
        {children.length === 0 ? <p className="py-6 text-sm text-muted-foreground">{empty}</p> : children}
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

function FlowChart({ data }: { data: { label: string; entradas: number; saidas: number }[] }) {
  const config: ChartConfig = {
    entradas: { label: "Entradas", color: "var(--chart-1)" },
    saidas: { label: "Saídas", color: "var(--chart-5)" },
  };

  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <LineChart data={data} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" />
        <YAxis tickLine={false} axisLine={false} fontSize={11} width={30} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          type="monotone"
          dataKey="entradas"
          stroke="var(--color-entradas)"
          strokeWidth={2.5}
          dot={false}
          isAnimationActive
          animationDuration={900}
        />
        <Line
          type="monotone"
          dataKey="saidas"
          stroke="var(--color-saidas)"
          strokeWidth={2.5}
          dot={false}
          isAnimationActive
          animationDuration={900}
          animationBegin={150}
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
}: {
  data: { name: string; qty?: number; profit?: number }[];
  dataKey: "qty" | "profit";
  valueFormat: (n: number) => string;
  color: string;
}) {
  const config: ChartConfig = { [dataKey]: { label: dataKey === "qty" ? "Unidades" : "Lucro", color } };

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Sem movimentações ainda.</p>;
  }

  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} tickFormatter={valueFormat} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={11} width={110} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => valueFormat(Number(v))} />} />
        <Bar dataKey={dataKey} fill={`var(--color-${dataKey})`} radius={4} isAnimationActive animationDuration={900} />
      </BarChart>
    </ChartContainer>
  );
}
