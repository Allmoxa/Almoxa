import { createFileRoute } from "@tanstack/react-router";
import { requireOwner } from "@/lib/guards";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { useStoreContext } from "@/hooks/use-store-context";
import { useUserRole } from "@/hooks/use-user-role";
import { supabase } from "@/integrations/supabase/client";
import { extractProducts, type ExtractedItem } from "@/lib/intake.functions";
import {
  currency,
  formatBalance,
  normalizeName,
  qty,
  toBaseQuantity,
  UNIT_LABELS,
  UNITS,
  type Product,
  type Unit,
} from "@/lib/inventory";
import { freeSku } from "@/lib/sku";

export const Route = createFileRoute("/_authenticated/receber")({
  head: () => ({
    meta: [
      { title: "Receber produtos por foto ou nota — Almoxá" },
      {
        name: "description",
        content:
          "Tire uma foto do produto ou envie a nota de compra: a leitura automática preenche o estoque.",
      },
      { property: "og:title", content: "Receber produtos por foto ou nota — Almoxá" },
      {
        property: "og:description",
        content:
          "Tire uma foto do produto ou envie a nota de compra: a leitura automática preenche o estoque.",
      },
    ],
  }),
  beforeLoad: requireOwner,
  component: ReceberPage,
});

const inputClass =
  "w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-ring";

const toDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
    reader.readAsDataURL(file);
  });

/** Linha de conferência de um ingrediente, pra conta "comida". */
type IngredientRow = {
  name: string;
  quantity: number;
  unit: Unit;
  note: string;
  /** id de um ingrediente já cadastrado que bateu pelo nome (acento/caixa/espaço à parte); null = vira ingrediente novo. */
  matchedId: string | null;
};

/** Resumo do que a produção automática gerou depois de uma entrada. */
type ProductionSummary = { productName: string; quantity: number }[];

function ReceberPage() {
  const { businessType, isLoading } = useUserRole();
  // Sem isso, uma conta "comida" veria a tela de produtos por um instante
  // antes do tipo de negócio carregar -- o mesmo cuidado que EstoquePage já
  // toma pro comissionado.
  if (isLoading) return null;
  if (businessType === "comida") return <ReceberIngredientes />;
  return <ReceberProdutos />;
}

/**
 * Conta "comida": toda entrada de estoque é de ingrediente -- nunca de
 * produto final. O produto final só ganha estoque pela receita (gatilho
 * movements_convert_recipe), disparado automaticamente assim que a entrada
 * do ingrediente é confirmada aqui.
 */
function ReceberIngredientes() {
  const queryClient = useQueryClient();
  const { storeOwnerId } = useStoreContext();
  const extract = useServerFn(extractProducts);
  const cameraRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<IngredientRow[] | null>(null);
  const [origin, setOrigin] = useState<"photo" | "document">("photo");
  const [preview, setPreview] = useState<string | null>(null);
  const [production, setProduction] = useState<ProductionSummary | null>(null);
  const [remaining, setRemaining] = useState<{ name: string; base: number; unit: Unit }[] | null>(
    null,
  );

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

  const matchIngredient = (name: string): Product | null => {
    const normalized = normalizeName(name);
    return ingredients.find((item) => normalizeName(item.name) === normalized) ?? null;
  };

  const read = useMutation({
    mutationFn: async ({ files, mode }: { files: File[]; mode: "photo" | "document" }) => {
      const payload = await Promise.all(
        files.slice(0, 4).map(async (file) => {
          if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name} passa de 12 MB`);
          return {
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            dataUrl: await toDataUrl(file),
          };
        }),
      );
      const firstImage = payload.find((f) => f.mimeType.startsWith("image/"));
      setPreview(firstImage?.dataUrl ?? null);
      setOrigin(mode);
      return extract({ data: { files: payload, mode } });
    },
    onSuccess: (result) => {
      // A leitura devolve "produtos" no vocabulário genérico, mas aqui todo
      // item vira candidato a ingrediente -- casado pelo nome (sem acento,
      // caixa ou espaço) com o que já existe, ou marcado como novo.
      const mapped: IngredientRow[] = result.items.map((item: ExtractedItem) => {
        const matched = matchIngredient(item.name);
        return {
          // Casado: usa o nome canônico já cadastrado, não o texto bruto da
          // leitura -- evita "farinha de trigo" (OCR) conviver na tela com
          // "Farinha de Trigo Especial" (cadastro) como se fossem coisas
          // diferentes quando na verdade já casaram pelo mesmo ingrediente.
          name: matched?.name ?? item.name,
          quantity: item.quantity,
          unit: matched?.unit ?? "unidade",
          note: item.note,
          matchedId: matched?.id ?? null,
        };
      });
      setRows(mapped);
      setProduction(null);
      setRemaining(null);
      toast.success(`${mapped.length} ingrediente(s) identificado(s) — confira antes de confirmar`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha na leitura"),
  });

  const confirm = useMutation({
    mutationFn: async (entries: IngredientRow[]) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");
      const storeId = storeOwnerId ?? userId;
      const touchedIds: string[] = [];
      const insertedMovementIds: string[] = [];
      // Duas linhas novas com o mesmo nome (variação de acento/caixa que o
      // fuzzy-match não pegou porque nenhuma das duas está cadastrada ainda)
      // não podem virar dois produtos -- a segunda reaproveita o ingrediente
      // que a primeira acabou de criar neste mesmo lote.
      const createdInBatch = new Map<string, string>();

      for (const row of entries) {
        if (row.quantity <= 0) throw new Error(`Quantidade inválida para ${row.name}`);

        let ingredientId = row.matchedId;
        if (!ingredientId) {
          const normalized = normalizeName(row.name);
          ingredientId = createdInBatch.get(normalized) ?? null;
        }
        if (!ingredientId) {
          const { data: inserted, error } = await supabase
            .from("products")
            .insert({
              user_id: storeId,
              name: row.name,
              sku: await freeSku(row.name, storeId),
              is_ingredient: true,
              unit: row.unit,
              // Sem quantity: o saldo nasce do movimento de entrada logo abaixo.
            })
            .select("id")
            .single();
          if (error) throw error;
          ingredientId = inserted.id;
          createdInBatch.set(normalizeName(row.name), ingredientId);
        }
        touchedIds.push(ingredientId);

        const { data: insertedMovement, error: movementError } = await supabase
          .from("movements")
          .insert({
            user_id: storeId,
            product_id: ingredientId,
            kind: "in",
            quantity: toBaseQuantity(row.quantity, row.unit),
            unit_price: 0,
            source: origin,
            note: row.note || null,
          })
          .select("id")
          .single();
        if (movementError) throw movementError;
        insertedMovementIds.push(insertedMovement.id);
      }

      // O gatilho de receita já rodou (é AFTER INSERT em cada movimento
      // acima) -- agora só juntamos o que ele gerou pra mostrar pro usuário.
      // Filtrado por triggered_by_movement_id (não por janela de tempo): o
      // relógio do navegador pode divergir do servidor, e duas abas
      // recebendo ao mesmo tempo não podem se misturar.
      const { data: produced } = await supabase
        .from("movements")
        .select("product_id, quantity, products(name)")
        .eq("source", "receita")
        .eq("kind", "in")
        .in("triggered_by_movement_id", insertedMovementIds);

      const producedByProduct = new Map<string, ProductionSummary[number]>();
      for (const row of produced ?? []) {
        const name = (row.products as { name: string } | null)?.name ?? "Produto";
        const current = producedByProduct.get(row.product_id);
        producedByProduct.set(row.product_id, {
          productName: name,
          quantity: (current?.quantity ?? 0) + Number(row.quantity),
        });
      }

      const { data: freshBalances } = await supabase
        .from("products")
        .select("id, name, quantity, unit")
        .in("id", touchedIds);

      return {
        production: Array.from(producedByProduct.values()),
        remaining: (freshBalances ?? []).map((p) => ({
          name: p.name,
          base: Number(p.quantity),
          unit: p.unit as Unit,
        })),
      };
    },
    onSuccess: ({ production: producedSummary, remaining: remainingBalances }) => {
      setProduction(producedSummary);
      setRemaining(remainingBalances);
      setRows(null);
      setPreview(null);
      if (producedSummary.length > 0) {
        toast.success(
          `Produção automática: ${producedSummary
            .map((p) => `${qty(p.quantity)} un. de ${p.productName}`)
            .join(", ")}`,
        );
      } else {
        toast.success(
          "Entrada registrada. Os ingredientes ficarão armazenados até completar uma receita.",
        );
      }
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      queryClient.invalidateQueries({ queryKey: ["ingredients-stock"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao salvar"),
  });

  const update = (index: number, patch: Partial<IngredientRow>) =>
    setRows(
      (current) => current?.map((row, i) => (i === index ? { ...row, ...patch } : row)) ?? null,
    );

  return (
    <AppShell
      title="Receber ingredientes"
      description="Fotografe os ingredientes ou envie a nota de compra. Quando houver o suficiente pra uma receita, o produto pronto entra sozinho no estoque."
    >
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) read.mutate({ files, mode: "photo" });
        }}
      />
      <input
        ref={docRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) read.mutate({ files, mode: "document" });
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={read.isPending}
          className="paper-panel group flex flex-col items-start p-7 text-left transition-colors hover:border-border-strong disabled:opacity-60"
        >
          <span className="label-caps">Modo rápido</span>
          <span className="mt-3 font-display text-2xl">Tirar foto</span>
          <span className="mt-2 text-sm text-muted-foreground">
            Aponte para o ingrediente ou pra etiqueta. Funciona também com fotos da galeria.
          </span>
        </button>
        <button
          onClick={() => docRef.current?.click()}
          disabled={read.isPending}
          className="paper-panel group flex flex-col items-start p-7 text-left transition-colors hover:border-border-strong disabled:opacity-60"
        >
          <span className="label-caps">Compra em lote</span>
          <span className="mt-3 font-display text-2xl">Importar documento</span>
          <span className="mt-2 text-sm text-muted-foreground">
            Nota fiscal, pedido ou recibo em PDF ou imagem — todos os ingredientes de uma vez.
          </span>
        </button>
      </div>

      {read.isPending ? (
        <div className="mt-8 flex flex-col items-center gap-3">
          <BoxSpinner size={32} />
          <p className="text-center text-sm text-muted-foreground">Lendo o material…</p>
        </div>
      ) : null}

      {production || remaining ? (
        <section className="paper-panel mt-8 p-6">
          <p className="label-caps">Entrada registrada com sucesso</p>
          {production && production.length > 0 ? (
            <p className="mt-2 text-sm">
              Produção automática:{" "}
              {production.map((p, i) => (
                <span key={p.productName}>
                  {i > 0 ? ", " : ""}
                  <span className="font-medium">
                    {qty(p.quantity)} unidade(s) de {p.productName}
                  </span>
                </span>
              ))}
              .
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Os ingredientes ficarão armazenados até completar uma receita.
            </p>
          )}
          {remaining && remaining.length > 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Saldo atual:{" "}
              {remaining.map((r) => `${formatBalance(r.base, r.unit)} de ${r.name}`).join(", ")}.
            </p>
          ) : null}
        </section>
      ) : null}

      {rows ? (
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="label-caps">Conferência</p>
              <h2 className="mt-2 text-3xl">{rows.length} ingrediente(s) para dar entrada</h2>
            </div>
          </div>

          {preview ? (
            <img
              src={preview}
              alt="Material enviado para leitura"
              className="mt-6 h-40 w-auto rounded-lg border border-border object-cover"
            />
          ) : null}

          <div className="paper-panel mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="label-caps px-4 py-3 font-normal">Ingrediente</th>
                  <th className="label-caps px-3 py-3 font-normal">Correspondência</th>
                  <th className="label-caps px-3 py-3 font-normal">Qtd.</th>
                  <th className="label-caps px-3 py-3 font-normal">Unidade</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <input
                        value={row.name}
                        onChange={(e) => update(index, { name: e.target.value })}
                        disabled={row.matchedId !== null}
                        title={
                          row.matchedId !== null
                            ? "Nome do ingrediente já cadastrado -- troque em Correspondência"
                            : undefined
                        }
                        className={`${inputClass} min-w-40 disabled:opacity-60`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={row.matchedId ?? ""}
                        onChange={(e) => {
                          const id = e.target.value || null;
                          const found = ingredients.find((item) => item.id === id);
                          update(index, {
                            matchedId: id,
                            unit: found?.unit ?? row.unit,
                            name: found?.name ?? row.name,
                          });
                        }}
                        className={`${inputClass} min-w-36`}
                      >
                        <option value="">Criar novo ingrediente</option>
                        {ingredients.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        step="0.001"
                        value={row.quantity}
                        onChange={(e) => update(index, { quantity: Number(e.target.value) })}
                        className={`${inputClass} w-24`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={row.unit}
                        onChange={(e) => update(index, { unit: e.target.value as Unit })}
                        disabled={row.matchedId !== null}
                        className={`${inputClass} w-24 disabled:opacity-60`}
                      >
                        {UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {UNIT_LABELS[unit]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() =>
                          setRows((current) => current?.filter((_, i) => i !== index) ?? null)
                        }
                        className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                      >
                        Descartar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex gap-2">
            <button
              onClick={() => confirm.mutate(rows)}
              disabled={confirm.isPending || rows.length === 0}
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Dar entrada no estoque
            </button>
            <button
              onClick={() => {
                setRows(null);
                setPreview(null);
              }}
              className="rounded-md border border-border-strong px-5 py-2.5 text-sm transition-colors hover:bg-secondary"
            >
              Descartar leitura
            </button>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

/** Conta "varejo": comportamento de sempre, sem nenhuma mudança. */
function ReceberProdutos() {
  const queryClient = useQueryClient();
  const { storeOwnerId } = useStoreContext();
  const extract = useServerFn(extractProducts);
  const cameraRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ExtractedItem[] | null>(null);
  const [origin, setOrigin] = useState<"photo" | "document">("photo");
  const [preview, setPreview] = useState<string | null>(null);

  const read = useMutation({
    mutationFn: async ({ files, mode }: { files: File[]; mode: "photo" | "document" }) => {
      const payload = await Promise.all(
        files.slice(0, 4).map(async (file) => {
          if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name} passa de 12 MB`);
          return {
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            dataUrl: await toDataUrl(file),
          };
        }),
      );
      const firstImage = payload.find((f) => f.mimeType.startsWith("image/"));
      setPreview(firstImage?.dataUrl ?? null);
      setOrigin(mode);
      return extract({ data: { files: payload, mode } });
    },
    onSuccess: (result) => {
      setItems(result.items);
      toast.success(`${result.items.length} item(ns) identificado(s)`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha na leitura"),
  });

  const confirm = useMutation({
    mutationFn: async (rows: ExtractedItem[]) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");
      // Dentro de uma loja adentrada, a entrada é dela, não do onisciente.
      const storeId = storeOwnerId ?? userId;

      for (const row of rows) {
        const informed = row.sku.trim().slice(0, 80);

        // Com código na nota, o código diz qual produto é: receber a mesma peça
        // de novo atualiza o preço da que já está cadastrada. Sem código, quem
        // identifica é o nome — casar pelo slug juntava "tam. P" e "tam. M" num
        // produto só, porque os dois geram o mesmo rótulo.
        //
        // Nome exato, e não ilike: nome com capitalização diferente cadastra um
        // produto a mais, que aparece na lista e o dono junta. O erro contrário
        // — dois produtos virarem um — é o que se está consertando aqui, e esse
        // some sem deixar rastro, levando junto o preço e a entrada da nota.
        const [column, value] = informed
          ? (["sku", informed] as const)
          : (["name", row.name] as const);
        const found = await supabase
          .from("products")
          .select("id")
          .eq(column, value)
          .limit(1)
          .maybeSingle();

        let productId = found.data?.id;
        if (productId) {
          const { error } = await supabase
            .from("products")
            .update({
              purchase_price: row.purchase_price,
              ...(row.sale_price > 0 ? { sale_price: row.sale_price } : {}),
            })
            .eq("id", productId);
          if (error) throw error;
        } else {
          const { data: inserted, error } = await supabase
            .from("products")
            .insert({
              user_id: storeId,
              name: row.name,
              sku: informed || (await freeSku(row.name, storeId)),
              purchase_price: row.purchase_price,
              sale_price: row.sale_price,
              // Sem quantity: o saldo nasce do movimento de entrada logo abaixo.
              notes: row.note || null,
            })
            .select("id")
            .single();
          if (error) throw error;
          productId = inserted.id;
        }

        const { error: movementError } = await supabase.from("movements").insert({
          user_id: storeId,
          product_id: productId,
          kind: "in",
          quantity: row.quantity,
          unit_price: row.purchase_price,
          source: origin,
          note: row.note || null,
        });
        if (movementError) throw movementError;
      }
    },
    onSuccess: () => {
      toast.success("Entrada registrada no estoque");
      setItems(null);
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao salvar"),
  });

  const update = (index: number, patch: Partial<ExtractedItem>) =>
    setItems(
      (current) => current?.map((item, i) => (i === index ? { ...item, ...patch } : item)) ?? null,
    );

  const total = items?.reduce((sum, item) => sum + item.quantity * item.purchase_price, 0) ?? 0;

  return (
    <AppShell
      title="Receber"
      description="Fotografe o produto ou envie a nota de compra. A leitura preenche nome, código, quantidade e preços — você só confere."
    >
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) read.mutate({ files, mode: "photo" });
        }}
      />
      <input
        ref={docRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) read.mutate({ files, mode: "document" });
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={read.isPending}
          className="paper-panel group flex flex-col items-start p-7 text-left transition-colors hover:border-border-strong disabled:opacity-60"
        >
          <span className="label-caps">Modo rápido</span>
          <span className="mt-3 font-display text-2xl">Tirar foto</span>
          <span className="mt-2 text-sm text-muted-foreground">
            Aponte para o produto ou para a etiqueta. Funciona também com fotos da galeria.
          </span>
        </button>
        <button
          onClick={() => docRef.current?.click()}
          disabled={read.isPending}
          className="paper-panel group flex flex-col items-start p-7 text-left transition-colors hover:border-border-strong disabled:opacity-60"
        >
          <span className="label-caps">Compra em lote</span>
          <span className="mt-3 font-display text-2xl">Importar documento</span>
          <span className="mt-2 text-sm text-muted-foreground">
            Nota fiscal, pedido ou recibo em PDF ou imagem — todos os itens de uma vez.
          </span>
        </button>
      </div>

      {read.isPending ? (
        <div className="mt-8 flex flex-col items-center gap-3">
          <BoxSpinner size={32} />
          <p className="text-center text-sm text-muted-foreground">Lendo o material…</p>
        </div>
      ) : null}

      {items ? (
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="label-caps">Conferência</p>
              <h2 className="mt-2 text-3xl">{items.length} item(ns) para dar entrada</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Total da compra <span className="font-medium text-foreground">{currency(total)}</span>
            </p>
          </div>

          {preview ? (
            <img
              src={preview}
              alt="Material enviado para leitura"
              className="mt-6 h-40 w-auto rounded-lg border border-border object-cover"
            />
          ) : null}

          <div className="paper-panel mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="label-caps px-4 py-3 font-normal">Produto</th>
                  <th className="label-caps px-3 py-3 font-normal">SKU</th>
                  <th className="label-caps px-3 py-3 font-normal">Qtd.</th>
                  <th className="label-caps px-3 py-3 font-normal">Compra</th>
                  <th className="label-caps px-3 py-3 font-normal">Venda</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <input
                        value={item.name}
                        onChange={(e) => update(index, { name: e.target.value })}
                        className={`${inputClass} min-w-44`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={item.sku}
                        onChange={(e) => update(index, { sku: e.target.value })}
                        placeholder="auto"
                        className={`${inputClass} min-w-28 font-mono text-xs`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        step="1"
                        value={item.quantity}
                        onChange={(e) => update(index, { quantity: Number(e.target.value) })}
                        className={`${inputClass} w-20`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        step="0.01"
                        value={item.purchase_price}
                        onChange={(e) => update(index, { purchase_price: Number(e.target.value) })}
                        className={`${inputClass} w-24`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        step="0.01"
                        value={item.sale_price}
                        onChange={(e) => update(index, { sale_price: Number(e.target.value) })}
                        className={`${inputClass} w-24`}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() =>
                          setItems((current) => current?.filter((_, i) => i !== index) ?? null)
                        }
                        className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                      >
                        Descartar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex gap-2">
            <button
              onClick={() => confirm.mutate(items)}
              disabled={confirm.isPending || items.length === 0}
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Dar entrada no estoque
            </button>
            <button
              onClick={() => {
                setItems(null);
                setPreview(null);
              }}
              className="rounded-md border border-border-strong px-5 py-2.5 text-sm transition-colors hover:bg-secondary"
            >
              Descartar leitura
            </button>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
