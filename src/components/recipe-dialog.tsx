import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ProductPicker } from "@/components/product-picker";
import { supabase } from "@/integrations/supabase/client";
import {
  computeProducibleUnits,
  formatBalance,
  qty,
  toBaseQuantity,
  UNIT_LABELS,
  UNITS_BY_DIMENSION,
  unitDimension,
  type Product,
  type Unit,
} from "@/lib/inventory";

type RecipeRow = {
  key: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: Unit;
};

const inputClass =
  "w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-ring";

const selectClass =
  "rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none transition-colors focus:border-ring";

/**
 * Receita de um produto final: quais ingredientes entram e quanto de cada,
 * por unidade. Ingrediente é só um product com is_ingredient=true -- some da
 * grade normal do Estoque, existe só pra essa tela e pro gatilho de conversão
 * enxergar (ver migration 20260820100000 + 20260821090000, que somou unidade
 * de medida e as travas de proteção).
 *
 * Salvar apaga todas as linhas da receita no banco e reinsere as atuais: a
 * lista é sempre curta, e não existe em nenhum outro lugar do app um padrão
 * de diff parcial pra lista filha que valesse a pena copiar aqui.
 */
export function RecipeDialog({
  product,
  storeOwnerId,
  onClose,
}: {
  product: Product;
  storeOwnerId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<RecipeRow[] | null>(null);
  const [pickedIngredient, setPickedIngredient] = useState("");
  const [newIngredientName, setNewIngredientName] = useState("");
  const [newIngredientUnit, setNewIngredientUnit] = useState<Unit>("unidade");
  const [quantity, setQuantity] = useState("");
  const [rowUnit, setRowUnit] = useState<Unit>("unidade");
  const [creatingIngredient, setCreatingIngredient] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: ingredients = [] } = useQuery({
    queryKey: ["ingredients"],
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

  const { data: fetchedRecipe } = useQuery({
    queryKey: ["recipe", product.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe_ingredients")
        .select("id, ingredient_id, quantity, unit")
        .eq("product_id", product.id);
      if (error) throw error;

      const ingredientIds = data.map((row) => row.ingredient_id);
      const { data: ingredientProducts, error: productsError } =
        ingredientIds.length > 0
          ? await supabase.from("products").select("id, name").in("id", ingredientIds)
          : { data: [], error: null };
      if (productsError) throw productsError;
      const nameById = new Map((ingredientProducts ?? []).map((p) => [p.id, p.name]));

      return data.map((row) => ({
        key: row.id,
        ingredientId: row.ingredient_id,
        ingredientName: nameById.get(row.ingredient_id) ?? "—",
        quantity: Number(row.quantity),
        unit: row.unit as Unit,
      }));
    },
  });

  // Só aplica o resultado da busca UMA vez (rows ainda null) -- setar direto
  // dentro do queryFn (como era antes) reexecutava a cada refetch em segundo
  // plano do React Query (ex: o usuário volta pra aba depois de trocar de
  // janela) e apagava silenciosamente edição que a pessoa ainda não salvou.
  useEffect(() => {
    if (fetchedRecipe && rows === null) setRows(fetchedRecipe);
  }, [fetchedRecipe, rows]);

  const visibleRows = rows ?? [];
  const producibleNow = computeProducibleUnits(
    visibleRows.map((row) => {
      const ingredientProduct = ingredients.find((item) => item.id === row.ingredientId);
      return {
        balanceBase: ingredientProduct?.quantity ?? 0,
        neededBase: toBaseQuantity(row.quantity, row.unit),
      };
    }),
  );
  const pickedIngredientProduct = ingredients.find((item) => item.id === pickedIngredient);
  const pickedDimension = pickedIngredientProduct
    ? unitDimension(pickedIngredientProduct.unit)
    : null;
  const rowUnitOptions = pickedDimension
    ? UNITS_BY_DIMENSION[pickedDimension]
    : ["unidade" as Unit];

  const createIngredient = useMutation({
    mutationFn: async (name: string) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");
      const storeId = storeOwnerId ?? userId;
      const { data, error } = await supabase
        .from("products")
        .insert({ user_id: storeId, name, sku: "", is_ingredient: true, unit: newIngredientUnit })
        .select("id, name, unit")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      setPickedIngredient(created.id);
      setRowUnit(created.unit as Unit);
      setNewIngredientName("");
      setNewIngredientUnit("unidade");
      setCreatingIngredient(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Erro ao criar ingrediente"),
  });

  const pickIngredient = (id: string) => {
    setPickedIngredient(id);
    const found = ingredients.find((item) => item.id === id);
    if (found) setRowUnit(found.unit);
  };

  const addRow = () => {
    const qtyValue = Number(quantity.replace(",", "."));
    if (!pickedIngredient) {
      toast.error("Escolha ou crie um ingrediente");
      return;
    }
    if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
      toast.error("Informe a quantidade por unidade");
      return;
    }
    if (visibleRows.some((row) => row.ingredientId === pickedIngredient)) {
      toast.error(
        "Este ingrediente já está na receita — remova a linha antes de adicionar de novo",
      );
      return;
    }
    const ingredient = ingredients.find((item) => item.id === pickedIngredient);
    setRows((current) => [
      ...(current ?? []),
      {
        key: `new-${pickedIngredient}-${Date.now()}`,
        ingredientId: pickedIngredient,
        ingredientName: ingredient?.name ?? "—",
        quantity: qtyValue,
        unit: rowUnit,
      },
    ]);
    setPickedIngredient("");
    setQuantity("");
    setRowUnit("unidade");
  };

  const removeRow = (key: string) => {
    setRows((current) => (current ?? []).filter((row) => row.key !== key));
  };

  const save = async () => {
    setSaving(true);
    try {
      // Apaga e reinsere dentro da MESMA transação (função save_recipe, ver
      // migration 20260821090000) -- antes eram duas chamadas separadas do
      // cliente, e se o insert falhasse (ex: trigger de validação barrando
      // por unidade incompatível) a receita ficava vazia no banco sem aviso.
      // Falhando aqui, nada muda: o delete desfaz junto.
      const saveRecipe = supabase.rpc as unknown as (
        fn: "save_recipe",
        args: {
          _product_id: string;
          _rows: { ingredient_id: string; quantity: number; unit: Unit }[];
        },
      ) => Promise<{ error: { message: string } | null }>;
      const { error } = await saveRecipe("save_recipe", {
        _product_id: product.id,
        _rows: visibleRows.map((row) => ({
          ingredient_id: row.ingredientId,
          quantity: row.quantity,
          unit: row.unit,
        })),
      });
      if (error) throw new Error(error.message);

      toast.success("Receita salva");
      queryClient.invalidateQueries({ queryKey: ["recipe", product.id] });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar a receita");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/25 px-6">
      <div className="paper-panel w-full max-w-lg p-6" style={{ boxShadow: "var(--shadow-lift)" }}>
        <p className="label-caps">Receita</p>
        <h2 className="mt-2 text-2xl">{product.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cadastre quanto de cada ingrediente é necessário para produzir uma unidade. Quando houver
          ingredientes suficientes, o produto será adicionado automaticamente ao estoque — e as
          sobras continuarão disponíveis para as próximas produções.
        </p>

        <div className="mt-5 space-y-2">
          {visibleRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum ingrediente ainda.</p>
          ) : (
            visibleRows.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>{row.ingredientName}</span>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums text-muted-foreground">
                    {qty(row.quantity)} {UNIT_LABELS[row.unit]}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-5 rounded-md border border-dashed border-border-strong p-3">
          <p className="label-caps">Adicionar ingrediente</p>
          {creatingIngredient ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                autoFocus
                value={newIngredientName}
                onChange={(event) => setNewIngredientName(event.target.value)}
                placeholder="Nome do ingrediente"
                className={`${inputClass} min-w-32 flex-1`}
              />
              <select
                value={newIngredientUnit}
                onChange={(event) => setNewIngredientUnit(event.target.value as Unit)}
                aria-label="Unidade do ingrediente"
                className={selectClass}
              >
                <option value="unidade">unidade</option>
                <option value="g">grama (g)</option>
                <option value="kg">quilo (kg)</option>
                <option value="ml">mililitro (ml)</option>
                <option value="l">litro (l)</option>
              </select>
              <button
                type="button"
                disabled={createIngredient.isPending || !newIngredientName.trim()}
                onClick={() => createIngredient.mutate(newIngredientName.trim())}
                className="shrink-0 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Criar
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreatingIngredient(false);
                  setNewIngredientName("");
                  setNewIngredientUnit("unidade");
                }}
                className="shrink-0 rounded-md border border-border-strong px-3 text-sm transition-colors hover:bg-secondary"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ProductPicker
                products={ingredients}
                value={pickedIngredient}
                onChange={pickIngredient}
                className="min-w-40 flex-1"
              />
              <button
                type="button"
                onClick={() => setCreatingIngredient(true)}
                className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Novo ingrediente
              </button>
            </div>
          )}
          {pickedIngredientProduct ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Saldo em estoque:{" "}
              {formatBalance(pickedIngredientProduct.quantity, pickedIngredientProduct.unit)}
            </p>
          ) : null}
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              step="0.001"
              min="0"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder={`Quantidade por unidade de ${product.name}`}
              className={inputClass}
            />
            <select
              value={rowUnit}
              onChange={(event) => setRowUnit(event.target.value as Unit)}
              aria-label="Unidade da quantidade"
              className={selectClass}
            >
              {rowUnitOptions.map((option) => (
                <option key={option} value={option}>
                  {UNIT_LABELS[option]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addRow}
              className="shrink-0 rounded-md border border-border-strong px-3 text-sm transition-colors hover:bg-secondary"
            >
              Adicionar
            </button>
          </div>
        </div>

        {visibleRows.length > 0 ? (
          <div className="mt-5 rounded-md bg-secondary/50 p-3">
            <p className="label-caps">Para produzir 1 {product.name}</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {visibleRows.map((row) => (
                <li key={row.key}>
                  {row.ingredientName}: {qty(row.quantity)} {UNIT_LABELS[row.unit]}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm font-medium">
              {producibleNow > 0
                ? `Com o estoque atual, dá pra produzir ${qty(producibleNow)} unidade(s) agora.`
                : "Ainda não há ingredientes suficientes para produzir este item."}
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar receita"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border-strong px-4 py-2 text-sm transition-colors hover:bg-secondary"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
