import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { currency, qty, slugSku, type Product } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque — Almoxá" },
      { name: "description", content: "Veja quantidades, custo, preço de venda e lucro de cada produto do seu estoque." },
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

function EstoquePage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [moving, setMoving] = useState<{ product: Product; kind: "in" | "out" } | null>(null);

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

  const createProduct = useMutation({
    mutationFn: async (values: z.infer<typeof productSchema>) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");
      const { data, error } = await supabase
        .from("products")
        .insert({
          user_id: userId,
          name: values.name,
          sku: values.sku || slugSku(values.name),
          purchase_price: values.purchase_price,
          sale_price: values.sale_price,
          quantity: 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (values.quantity > 0) {
        const { error: movementError } = await supabase.from("movements").insert({
          user_id: userId,
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
      if (kind === "out" && quantity > product.quantity) throw new Error("Quantidade maior que o estoque disponível");
      const { error } = await supabase.from("movements").insert({
        user_id: userId,
        product_id: product.id,
        kind,
        quantity,
        unit_price,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Movimentação registrada");
      setMoving(null);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao registrar"),
  });

  const removeProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto removido");
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: () => toast.error("Erro ao remover"),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term));
  }, [products, search]);

  const totals = useMemo(() => {
    const cost = products.reduce((sum, p) => sum + p.quantity * p.purchase_price, 0);
    const revenue = products.reduce((sum, p) => sum + p.quantity * p.sale_price, 0);
    const units = products.reduce((sum, p) => sum + p.quantity, 0);
    return { cost, revenue, profit: revenue - cost, units };
  }, [products]);

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
      <section className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
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
            <input id="name" name="name" className={`mt-2 ${inputClass}`} placeholder="Camiseta preta P" />
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
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou SKU"
          className="max-w-xs rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
        />
        <p className="label-caps">{filtered.length} produtos</p>
      </div>

      <div className="paper-panel mt-4 overflow-hidden">
        {isLoading ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">Carregando…</p>
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
              {filtered.map((product) => {
                const profit = product.sale_price - product.purchase_price;
                return (
                  <tr key={product.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-4">
                      <p className="font-medium">{product.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{product.sku}</p>
                    </td>
                    <td className="px-3 py-4 text-right tabular-nums">{qty(product.quantity)}</td>
                    <td className="px-3 py-4 text-right tabular-nums">{currency(product.purchase_price)}</td>
                    <td className="px-3 py-4 text-right tabular-nums">{currency(product.sale_price)}</td>
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
                          Saída
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Remover ${product.name}?`)) removeProduct.mutate(product.id);
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/25 px-6">
          <form
            className="paper-panel w-full max-w-sm p-6"
            style={{ boxShadow: "var(--shadow-lift)" }}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const quantity = Number(form.get("quantity"));
              const unit_price = Number(form.get("unit_price"));
              if (!Number.isFinite(quantity) || quantity <= 0) {
                toast.error("Quantidade inválida");
                return;
              }
              registerMovement.mutate({ product: moving.product, kind: moving.kind, quantity, unit_price });
            }}
          >
            <p className="label-caps">{moving.kind === "in" ? "Entrada" : "Saída"}</p>
            <h2 className="mt-2 text-2xl">{moving.product.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Em estoque: {qty(moving.product.quantity)}</p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="label-caps" htmlFor="mv-quantity">
                  Quantidade
                </label>
                <input
                  id="mv-quantity"
                  name="quantity"
                  type="number"
                  step="1"
                  defaultValue="1"
                  autoFocus
                  className={`mt-2 ${inputClass}`}
                />
              </div>
              <div>
                <label className="label-caps" htmlFor="mv-price">
                  Preço unitário
                </label>
                <input
                  id="mv-price"
                  name="unit_price"
                  type="number"
                  step="0.01"
                  defaultValue={moving.kind === "in" ? moving.product.purchase_price : moving.product.sale_price}
                  className={`mt-2 ${inputClass}`}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                type="submit"
                disabled={registerMovement.isPending}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setMoving(null)}
                className="rounded-md border border-border-strong px-4 py-2 text-sm transition-colors hover:bg-secondary"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}
