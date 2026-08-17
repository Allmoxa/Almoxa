import { createFileRoute } from "@tanstack/react-router";
import { requireOwner } from "@/lib/guards";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { useStoreContext } from "@/hooks/use-store-context";
import { supabase } from "@/integrations/supabase/client";
import { extractProducts, type ExtractedItem } from "@/lib/intake.functions";
import { currency, slugSku } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/receber")({
  head: () => ({
    meta: [
      { title: "Receber produtos por foto ou nota — Almoxá" },
      {
        name: "description",
        content: "Tire uma foto do produto ou envie a nota de compra: a leitura automática preenche o estoque.",
      },
      { property: "og:title", content: "Receber produtos por foto ou nota — Almoxá" },
      {
        property: "og:description",
        content: "Tire uma foto do produto ou envie a nota de compra: a leitura automática preenche o estoque.",
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

function ReceberPage() {
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
          return { name: file.name, mimeType: file.type || "application/octet-stream", dataUrl: await toDataUrl(file) };
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
        const sku = (row.sku || slugSku(row.name)).slice(0, 80);
        const { data: existing } = await supabase.from("products").select("id").eq("sku", sku).maybeSingle();

        let productId = existing?.id;
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
              sku,
              purchase_price: row.purchase_price,
              sale_price: row.sale_price,
              quantity: 0,
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
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao salvar"),
  });

  const update = (index: number, patch: Partial<ExtractedItem>) =>
    setItems((current) => current?.map((item, i) => (i === index ? { ...item, ...patch } : item)) ?? null);

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
                        onClick={() => setItems((current) => current?.filter((_, i) => i !== index) ?? null)}
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
