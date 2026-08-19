import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { ProductEditDialog, type ProductEditValues } from "@/components/product-edit-dialog";
import { ProductMovementDialog, type MovementValues } from "@/components/product-movement-dialog";
import { ProductProfitDialog } from "@/components/product-profit-dialog";
import { StoreStockView } from "@/components/store-stock-view";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { PaginationNav } from "@/components/ui/pagination-nav";
import { useStoreContext } from "@/hooks/use-store-context";
import { useUserRole } from "@/hooks/use-user-role";
import { supabase } from "@/integrations/supabase/client";
import {
  currency,
  noProfit,
  profitByProduct,
  profitSummary,
  qty,
  NON_SALE_SOURCES_FILTER,
  type Product,
  type Sale,
} from "@/lib/inventory";
import { freeSku } from "@/lib/sku";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque — Almoxá" },
      {
        name: "description",
        content: "Veja quantidades, custo, preço de venda e lucro de cada produto do seu estoque.",
      },
      { property: "og:title", content: "Estoque — Almoxá" },
      {
        property: "og:description",
        content: "Veja quantidades, custo, preço de venda e lucro de cada produto do seu estoque.",
      },
    ],
  }),
  component: EstoquePage,
});

const productSchema = z.object({
  name: z.string().trim().min(1, { message: "Informe o nome" }).max(200),
  sku: z.string().trim().max(80),
  purchase_price: z.coerce.number().min(0).max(10_000_000),
  sale_price: z.coerce.number().min(0).max(10_000_000),
  quantity: z.coerce.number().min(0).max(1_000_000),
});

const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring";

const PAGE_SIZE = 15;

function EstoquePage() {
  const { isComissionado, isLoading: loadingRole } = useUserRole();

  // O comissionado não tem linha de products pela RLS, então esta tela não teria
  // o que mostrar para ele — nem faria sentido, cheia de custo e lucro.
  if (loadingRole) return null;
  if (isComissionado) return <StoreStockView />;
  return <EstoqueDono />;
}

function EstoqueDono() {
  const queryClient = useQueryClient();
  const { storeOwnerId } = useStoreContext();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [moving, setMoving] = useState<{ product: Product; kind: "in" | "out" } | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [profiting, setProfiting] = useState<Product | null>(null);

  const { data: products = [], isLoading } = useQuery({
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

  const { data: sales = [] } = useQuery({
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

  const createProduct = useMutation({
    mutationFn: async (values: z.infer<typeof productSchema>) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");
      // Dentro de uma loja adentrada, o lançamento é dela, não do onisciente.
      const storeId = storeOwnerId ?? userId;
      const { data, error } = await supabase
        .from("products")
        .insert({
          user_id: storeId,
          name: values.name,
          sku: values.sku || (await freeSku(values.name, storeId)),
          purchase_price: values.purchase_price,
          sale_price: values.sale_price,
          // Sem quantity: o saldo nasce do movimento de entrada, e o INSERT
          // nessa coluna foi revogado justamente para não haver outra via.
        })
        .select("id")
        .single();
      if (error) throw error;
      if (values.quantity > 0) {
        const { error: movementError } = await supabase.from("movements").insert({
          user_id: storeId,
          product_id: data.id,
          kind: "in",
          quantity: values.quantity,
          unit_price: values.purchase_price,
          source: "manual",
        });
        if (movementError) throw movementError;
      }
    },
    onSuccess: () => {
      toast.success("Produto cadastrado");
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao cadastrar"),
  });

  const registerMovement = useMutation({
    mutationFn: async ({
      product,
      kind,
      quantity,
      unit_price,
    }: {
      product: Product;
      kind: "in" | "out";
      quantity: number;
      unit_price: number;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");
      // Dentro de uma loja adentrada, o lançamento é dela, não do onisciente.
      const storeId = storeOwnerId ?? userId;
      if (kind === "out" && quantity > product.quantity)
        throw new Error("Quantidade maior que o estoque disponível");
      const { error } = await supabase.from("movements").insert({
        user_id: storeId,
        product_id: product.id,
        kind,
        quantity,
        unit_price,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.kind === "out" ? "Venda registrada" : "Entrada registrada");
      setMoving(null);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao registrar"),
  });

  const updateProduct = useMutation({
    mutationFn: async ({ product, values }: { product: Product; values: ProductEditValues }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");
      // Dentro de uma loja adentrada, o lançamento é dela, não do onisciente.
      const storeId = storeOwnerId ?? userId;

      if (
        values.purchase_price !== product.purchase_price ||
        values.sale_price !== product.sale_price
      ) {
        const { error } = await supabase
          .from("products")
          .update({ purchase_price: values.purchase_price, sale_price: values.sale_price })
          .eq("id", product.id);
        if (error) throw error;
      }

      // A quantidade vive dos movimentos: mexer nela direto na tabela deixaria o
      // histórico sem explicação para a diferença.
      const delta = values.quantity - product.quantity;
      if (delta !== 0) {
        const { error } = await supabase.from("movements").insert({
          user_id: storeId,
          product_id: product.id,
          kind: delta > 0 ? "in" : "out",
          quantity: Math.abs(delta),
          unit_price: delta > 0 ? values.purchase_price : 0,
          unit_cost: values.purchase_price,
          source: "adjustment",
          note: "Ajuste manual de estoque",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Produto atualizado");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao atualizar"),
  });

  const removeProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto removido");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: () => toast.error("Erro ao remover"),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term),
    );
  }, [products, search]);

  // A paginação é do lado do navegador de propósito: os totais no topo e a busca
  // precisam do catálogo inteiro de qualquer forma, então buscar por página só
  // acrescentaria idas ao banco sem tirar nada da memória.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Derivado, não guardado: remover o último item de uma página recua sozinho.
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(firstIndex, firstIndex + PAGE_SIZE);

  const totals = useMemo(() => {
    const cost = products.reduce((sum, p) => sum + p.quantity * p.purchase_price, 0);
    const revenue = products.reduce((sum, p) => sum + p.quantity * p.sale_price, 0);
    const units = products.reduce((sum, p) => sum + p.quantity, 0);
    return { cost, revenue, profit: revenue - cost, units };
  }, [products]);

  const realized = useMemo(() => profitSummary(sales), [sales]);
  const profitPerProduct = useMemo(() => profitByProduct(sales), [sales]);

  return (
    <AppShell
      title="Estoque"
      description="Cada produto com custo, preço de saída e o lucro que ele carrega hoje."
      action={
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {creating ? "Cancelar" : "Novo produto"}
        </button>
      }
    >
      <section className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
        {[
          {
            label: "Lucro hoje",
            value: realized.today,
            units: realized.unitsToday,
            hint: "desde a meia-noite",
          },
          {
            label: "Lucro na semana",
            value: realized.week,
            units: realized.unitsWeek,
            hint: "últimos 7 dias",
          },
        ].map((item) => (
          <div key={item.label} className="bg-card px-5 py-5">
            <p className="label-caps">{item.label}</p>
            <p
              className={`mt-2 font-display text-3xl tabular-nums ${
                item.value < 0 ? "text-destructive" : "text-success"
              }`}
            >
              {currency(item.value)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {qty(item.units)} un. vendidas — {item.hint}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-4 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        {[
          { label: "Unidades", value: qty(totals.units) },
          { label: "Custo em estoque", value: currency(totals.cost) },
          { label: "Venda potencial", value: currency(totals.revenue) },
          { label: "Lucro potencial", value: currency(totals.profit) },
        ].map((item) => (
          <div key={item.label} className="bg-card px-5 py-5">
            <p className="label-caps">{item.label}</p>
            <p className="mt-2 font-display text-2xl">{item.value}</p>
          </div>
        ))}
      </section>

      {creating ? (
        <form
          className="paper-panel mt-6 grid gap-4 p-5 sm:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const parsed = productSchema.safeParse(Object.fromEntries(form));
            if (!parsed.success) {
              toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
              return;
            }
            createProduct.mutate(parsed.data);
          }}
        >
          <div className="sm:col-span-2">
            <label className="label-caps" htmlFor="name">
              Nome
            </label>
            <input
              id="name"
              name="name"
              className={`mt-2 ${inputClass}`}
              placeholder="Camiseta preta P"
            />
          </div>
          <div>
            <label className="label-caps" htmlFor="sku">
              SKU
            </label>
            <input id="sku" name="sku" className={`mt-2 ${inputClass}`} placeholder="opcional" />
          </div>
          <div>
            <label className="label-caps" htmlFor="purchase_price">
              Compra
            </label>
            <input
              id="purchase_price"
              name="purchase_price"
              type="number"
              step="0.01"
              defaultValue="0"
              className={`mt-2 ${inputClass}`}
            />
          </div>
          <div>
            <label className="label-caps" htmlFor="sale_price">
              Venda
            </label>
            <input
              id="sale_price"
              name="sale_price"
              type="number"
              step="0.01"
              defaultValue="0"
              className={`mt-2 ${inputClass}`}
            />
          </div>
          <div>
            <label className="label-caps" htmlFor="quantity">
              Quantidade inicial
            </label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              step="1"
              defaultValue="0"
              className={`mt-2 ${inputClass}`}
            />
          </div>
          <div className="flex items-end sm:col-span-4">
            <button
              type="submit"
              disabled={createProduct.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Salvar produto
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-10 flex items-center justify-between gap-4">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Buscar por nome ou SKU"
          className="max-w-xs rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
        />
        <p className="label-caps">
          {filtered.length > PAGE_SIZE
            ? `${firstIndex + 1}–${firstIndex + visible.length} de ${filtered.length} produtos`
            : `${filtered.length} produtos`}
        </p>
      </div>

      {pageCount > 1 ? (
        <div className="mt-4">
          <PaginationNav
            currentPage={currentPage}
            pageCount={pageCount}
            onChange={setPage}
            label="Paginação do estoque"
          />
        </div>
      ) : null}

      <div className="paper-panel mt-4 overflow-x-auto">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10">
            <BoxSpinner />
            <p className="text-center text-sm text-muted-foreground">Carregando…</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Nada aqui ainda. Cadastre manualmente ou use a tela Receber para ler uma foto ou nota.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label-caps px-5 py-3 font-normal">Produto</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Qtd.</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Compra</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Venda</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Lucro un.</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((product) => {
                const profit = product.sale_price - product.purchase_price;
                return (
                  <tr key={product.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-4">
                      <p className="font-medium">{product.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{product.sku}</p>
                    </td>
                    <td className="px-3 py-4 text-right tabular-nums">{qty(product.quantity)}</td>
                    <td className="px-3 py-4 text-right tabular-nums">
                      {currency(product.purchase_price)}
                    </td>
                    <td className="px-3 py-4 text-right tabular-nums">
                      {currency(product.sale_price)}
                    </td>
                    <td
                      className={`px-3 py-4 text-right tabular-nums ${profit < 0 ? "text-destructive" : "text-success"}`}
                    >
                      {currency(profit)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setMoving({ product, kind: "in" })}
                          className="rounded-md border border-border-strong px-2.5 py-1 text-xs transition-colors hover:bg-secondary"
                        >
                          Entrada
                        </button>
                        <button
                          onClick={() => setMoving({ product, kind: "out" })}
                          className="rounded-md border border-border-strong px-2.5 py-1 text-xs transition-colors hover:bg-secondary"
                        >
                          Vender
                        </button>
                        <button
                          onClick={() => setProfiting(product)}
                          className="rounded-md border border-border-strong px-2.5 py-1 text-xs transition-colors hover:bg-secondary"
                        >
                          Lucros
                        </button>
                        <button
                          onClick={() => setEditing(product)}
                          className="rounded-md border border-border-strong px-2.5 py-1 text-xs transition-colors hover:bg-secondary"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Remover ${product.name}?`))
                              removeProduct.mutate(product.id);
                          }}
                          className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                        >
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {moving ? (
        <ProductMovementDialog
          key={`${moving.product.id}-${moving.kind}`}
          product={moving.product}
          kind={moving.kind}
          pending={registerMovement.isPending}
          onCancel={() => setMoving(null)}
          onSubmit={(values: MovementValues) =>
            registerMovement.mutate({
              product: moving.product,
              kind: moving.kind,
              quantity: values.quantity,
              unit_price: values.unit_price,
            })
          }
        />
      ) : null}

      {editing ? (
        <ProductEditDialog
          key={editing.id}
          product={editing}
          pending={updateProduct.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={(values) => updateProduct.mutate({ product: editing, values })}
        />
      ) : null}

      {profiting ? (
        <ProductProfitDialog
          product={profiting}
          summary={profitPerProduct.get(profiting.id) ?? noProfit()}
          onClose={() => setProfiting(null)}
        />
      ) : null}
    </AppShell>
  );
}
