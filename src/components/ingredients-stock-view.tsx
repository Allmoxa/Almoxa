import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ProductEditDialog, type ProductEditValues } from "@/components/product-edit-dialog";
import { ProductMovementDialog, type MovementValues } from "@/components/product-movement-dialog";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { supabase } from "@/integrations/supabase/client";
import { currency, formatBalance, type Product, type Unit } from "@/lib/inventory";

const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring";

/**
 * Grade de ingredientes com saldo visível -- separada da grade de produtos
 * finais (que fica em EstoqueDono) porque as colunas que importam são
 * diferentes: aqui não tem preço de venda nem lucro, e entrada é o fluxo
 * normal (é assim que a receita acaba virando produto pronto sozinha).
 */
export function IngredientsStockView({ storeOwnerId }: { storeOwnerId: string | null }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);

  const { data: ingredients = [], isLoading } = useQuery({
    queryKey: ["ingredients-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, sku, quantity, purchase_price, sale_price, notes, created_at, is_ingredient, unit",
        )
        .eq("is_ingredient", true)
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ingredients-stock"] });
    queryClient.invalidateQueries({ queryKey: ["ingredients"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["movements"] });
  };

  const createIngredient = useMutation({
    mutationFn: async (values: { name: string; unit: Unit }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");
      const storeId = storeOwnerId ?? userId;
      const { error } = await supabase.from("products").insert({
        user_id: storeId,
        name: values.name,
        sku: "",
        is_ingredient: true,
        unit: values.unit,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ingrediente cadastrado");
      setCreating(false);
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Erro ao cadastrar ingrediente"),
  });

  const registerMovement = useMutation({
    mutationFn: async ({ product, values }: { product: Product; values: MovementValues }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");
      const storeId = storeOwnerId ?? userId;
      const { error } = await supabase.from("movements").insert({
        user_id: storeId,
        product_id: product.id,
        kind: "in",
        quantity: values.quantity,
        unit_price: values.unit_price,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entrada registrada");
      setMoving(null);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao registrar"),
  });

  const updateIngredient = useMutation({
    mutationFn: async ({ product, values }: { product: Product; values: ProductEditValues }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");
      const storeId = storeOwnerId ?? userId;

      if (values.purchase_price !== product.purchase_price) {
        const { error } = await supabase
          .from("products")
          .update({ purchase_price: values.purchase_price })
          .eq("id", product.id);
        if (error) throw error;
      }

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
      toast.success("Ingrediente atualizado");
      setEditing(null);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao atualizar"),
  });

  const removeIngredient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ingrediente removido");
      invalidate();
    },
    onError: (error) => {
      // A trava de proteção (produto usado em receita) devolve uma mensagem
      // pronta do banco -- mostra ela direto, é mais útil que um erro genérico.
      toast.error(error instanceof Error ? error.message : "Erro ao remover");
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          O saldo de cada ingrediente, pronto pra montar as receitas em Produtos.
        </p>
        <button
          onClick={() => setCreating((v) => !v)}
          className="shrink-0 rounded-md border border-border-strong px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
        >
          {creating ? "Cancelar" : "Novo ingrediente"}
        </button>
      </div>

      {creating ? (
        <form
          className="paper-panel mt-4 grid gap-4 p-5 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const name = String(form.get("name") ?? "").trim();
            const unit = String(form.get("unit") ?? "unidade") as Unit;
            if (!name) {
              toast.error("Informe o nome do ingrediente");
              return;
            }
            createIngredient.mutate({ name, unit });
          }}
        >
          <div className="sm:col-span-2">
            <label className="label-caps" htmlFor="ing-name">
              Nome
            </label>
            <input
              id="ing-name"
              name="name"
              className={`mt-2 ${inputClass}`}
              placeholder="Farinha de trigo"
            />
          </div>
          <div>
            <label className="label-caps" htmlFor="ing-unit">
              Unidade
            </label>
            <select
              id="ing-unit"
              name="unit"
              defaultValue="unidade"
              className={`mt-2 ${inputClass}`}
            >
              <option value="unidade">unidade</option>
              <option value="g">grama (g)</option>
              <option value="kg">quilo (kg)</option>
              <option value="ml">mililitro (ml)</option>
              <option value="l">litro (l)</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={createIngredient.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Salvar ingrediente
            </button>
          </div>
        </form>
      ) : null}

      <div className="paper-panel mt-6 overflow-x-auto">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10">
            <BoxSpinner />
            <p className="text-center text-sm text-muted-foreground">Carregando…</p>
          </div>
        ) : ingredients.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Cadastre seu primeiro ingrediente para começar a montar as receitas.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label-caps px-5 py-3 font-normal">Ingrediente</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Saldo</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Custo</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ingredient) => (
                <tr key={ingredient.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-4 font-medium">{ingredient.name}</td>
                  <td
                    className={`px-3 py-4 text-right tabular-nums ${
                      ingredient.quantity <= 0 ? "text-destructive" : ""
                    }`}
                  >
                    {formatBalance(ingredient.quantity, ingredient.unit)}
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums text-muted-foreground">
                    {currency(ingredient.purchase_price)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setMoving(ingredient)}
                        className="rounded-md border border-border-strong px-2.5 py-1 text-xs transition-colors hover:bg-secondary"
                      >
                        Entrada
                      </button>
                      <button
                        onClick={() => setEditing(ingredient)}
                        className="rounded-md border border-border-strong px-2.5 py-1 text-xs transition-colors hover:bg-secondary"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remover ${ingredient.name}?`))
                            removeIngredient.mutate(ingredient.id);
                        }}
                        className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                      >
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {moving ? (
        <ProductMovementDialog
          key={moving.id}
          product={moving}
          kind="in"
          pending={registerMovement.isPending}
          onCancel={() => setMoving(null)}
          onSubmit={(values) => registerMovement.mutate({ product: moving, values })}
        />
      ) : null}

      {editing ? (
        <ProductEditDialog
          key={editing.id}
          product={editing}
          pending={updateIngredient.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={(values) => updateIngredient.mutate({ product: editing, values })}
        />
      ) : null}
    </div>
  );
}
