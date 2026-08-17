import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ProductPicker } from "@/components/product-picker";
import { SaleBuilderDialog, type BuiltSaleLine } from "@/components/sale-builder-dialog";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { supabase } from "@/integrations/supabase/client";
import { extractSale, type ExtractedSaleItem } from "@/lib/sale-intake.functions";
import {
  currency,
  qty,
  splitReference,
  splitSaleTotal,
  NON_SALE_SOURCES_FILTER,
  type Product,
} from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/vender")({
  head: () => ({
    meta: [
      { title: "Vender — Almoxá" },
      {
        name: "description",
        content: "Registre a venda pela notinha ou monte o carrinho: o total informado se divide entre os produtos.",
      },
      { property: "og:title", content: "Vender — Almoxá" },
      {
        property: "og:description",
        content: "Registre a venda pela notinha ou monte o carrinho: o total informado se divide entre os produtos.",
      },
    ],
  }),
  component: VenderPage,
});

const inputClass =
  "w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-ring";

type SaleLine = {
  key: number;
  productId: string;
  /** Nome lido do documento, guardado para o caso de não casar com nenhum produto. */
  label: string;
  quantity: number;
  unit_price: number;
  note: string;
};

let nextKey = 1;

const toDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
    reader.readAsDataURL(file);
  });

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/** Casa o item lido com o estoque: primeiro pelo código, depois pelo nome. */
const matchProduct = (products: Product[], item: ExtractedSaleItem) => {
  const sku = normalize(item.sku);
  if (sku) {
    const bySku = products.find((p) => normalize(p.sku) === sku);
    if (bySku) return bySku;
  }
  const name = normalize(item.name);
  if (!name) return null;
  return (
    products.find((p) => normalize(p.name) === name) ??
    products.find((p) => normalize(p.name).includes(name) || name.includes(normalize(p.name))) ??
    null
  );
};

const sumOf = (lines: SaleLine[]) => lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);

function VenderPage() {
  const queryClient = useQueryClient();
  const read = useServerFn(extractSale);
  const docRef = useRef<HTMLInputElement>(null);
  const [lines, setLines] = useState<SaleLine[] | null>(null);
  const [origin, setOrigin] = useState<"manual" | "document">("manual");
  const [totalDraft, setTotalDraft] = useState("");
  const [building, setBuilding] = useState(false);

  const { data: products = [] } = useQuery({
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

  // Ranking de mais vendidos nos últimos 30 dias, para o atalho de produtos frequentes.
  const { data: frequentIds = [] } = useQuery({
    queryKey: ["frequent-sold-products"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("movements")
        .select("product_id, quantity")
        .eq("kind", "out")
        .not("source", "in", NON_SALE_SOURCES_FILTER)
        .is("reversed_at", null)
        .gte("created_at", since);
      if (error) throw error;
      const totals = new Map<string, number>();
      for (const m of data) totals.set(m.product_id, (totals.get(m.product_id) ?? 0) + m.quantity);
      return [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id]) => id);
    },
  });

  const productById = new Map(products.map((p) => [p.id, p]));
  const frequentProducts = frequentIds
    .map((id) => productById.get(id))
    .filter((product): product is Product => !!product);

  const openLines = (next: SaleLine[], total: number, from: "manual" | "document") => {
    setOrigin(from);
    setLines(next);
    setTotalDraft(total > 0 ? total.toFixed(2) : sumOf(next).toFixed(2));
  };

  const readNote = useMutation({
    mutationFn: async (files: File[]) => {
      const payload = await Promise.all(
        files.slice(0, 4).map(async (file) => {
          if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name} passa de 12 MB`);
          return { name: file.name, mimeType: file.type || "application/octet-stream", dataUrl: await toDataUrl(file) };
        }),
      );
      return read({ data: { files: payload } });
    },
    onSuccess: (result) => {
      const next = result.items.map<SaleLine>((item) => {
        const product = matchProduct(products, item);
        return {
          key: nextKey++,
          productId: product?.id ?? "",
          label: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price > 0 ? item.unit_price : (product?.sale_price ?? 0),
          note: item.note,
        };
      });

      // Notinha que só traz o total fechado: o valor de cada peça vem do rateio.
      const total = result.total > 0 ? result.total : sumOf(next);
      if (result.total > 0) {
        const prices = splitSaleTotal(
          next.map((line) => ({
            quantity: line.quantity,
            reference: splitReference(productById.get(line.productId)) || line.unit_price,
          })),
          result.total,
        );
        next.forEach((line, index) => {
          line.unit_price = prices[index] ?? line.unit_price;
        });
      }

      openLines(next, total, "document");
      const missing = next.filter((line) => !line.productId).length;
      toast.success(`${next.length} item(ns) lido(s)`);
      if (missing > 0) toast.warning(`${missing} item(ns) sem produto correspondente no estoque`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha na leitura"),
  });

  const register = useMutation({
    mutationFn: async (rows: SaleLine[]) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      const demand = new Map<string, number>();
      for (const row of rows) {
        if (!row.productId) throw new Error(`Escolha o produto de "${row.label}"`);
        if (row.quantity <= 0) throw new Error("Quantidade inválida");
        demand.set(row.productId, (demand.get(row.productId) ?? 0) + row.quantity);
      }
      for (const [productId, wanted] of demand) {
        const product = productById.get(productId);
        if (product && wanted > product.quantity) {
          throw new Error(`Estoque insuficiente de ${product.name}: há ${qty(product.quantity)} un.`);
        }
      }

      const ref = Date.now().toString(36).toUpperCase().slice(-4);
      const { error } = await supabase.from("movements").insert(
        rows.map((row) => ({
          user_id: userId,
          product_id: row.productId,
          kind: "out" as const,
          quantity: row.quantity,
          unit_price: row.unit_price,
          source: origin,
          note: row.note ? `Venda ${ref} — ${row.note}` : `Venda ${ref}`,
        })),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Venda registrada e estoque atualizado");
      setLines(null);
      setTotalDraft("");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao registrar a venda"),
  });

  const update = (key: number, patch: Partial<SaleLine>) =>
    setLines((current) => {
      const next = current?.map((line) => (line.key === key ? { ...line, ...patch } : line)) ?? null;
      if (next) setTotalDraft(sumOf(next).toFixed(2));
      return next;
    });

  /** Reescreve o valor unitário de cada linha a partir do total informado. */
  const applyTotal = (value: string) => {
    setTotalDraft(value);
    const total = Number(value.replace(",", "."));
    if (!Number.isFinite(total) || total <= 0) return;
    setLines((current) => {
      if (!current) return current;
      const prices = splitSaleTotal(
        current.map((line) => ({
          quantity: line.quantity,
          reference: productById.get(line.productId)?.sale_price ?? line.unit_price,
        })),
        total,
      );
      return current.map((line, index) => ({ ...line, unit_price: prices[index] ?? line.unit_price }));
    });
  };

  const total = lines ? sumOf(lines) : 0;
  const profit = lines
    ? lines.reduce((sum, line) => {
        const product = productById.get(line.productId);
        return product ? sum + (line.unit_price - product.purchase_price) * line.quantity : sum;
      }, 0)
    : 0;

  return (
    <AppShell
      title="Vender"
      description="Envie a notinha da venda ou monte o carrinho na mão. Informando só o total, o valor de cada peça sai dividido — você só confere."
    >
      <input
        ref={docRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) readNote.mutate(files);
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => {
            if (products.length === 0) {
              toast.error("Cadastre um produto antes de vender");
              return;
            }
            setBuilding(true);
          }}
          disabled={readNote.isPending}
          className="paper-panel group flex flex-col items-start p-7 text-left transition-colors hover:border-border-strong disabled:opacity-60"
        >
          <span className="label-caps">Venda no balcão</span>
          <span className="mt-3 font-display text-2xl">Vender</span>
          <span className="mt-2 text-sm text-muted-foreground">
            Escolha os produtos do estoque, a quantidade e quanto o cliente pagou no total.
          </span>
        </button>
        <button
          onClick={() => docRef.current?.click()}
          disabled={readNote.isPending}
          className="paper-panel group flex flex-col items-start p-7 text-left transition-colors hover:border-border-strong disabled:opacity-60"
        >
          <span className="label-caps">Venda registrada em papel</span>
          <span className="mt-3 font-display text-2xl">Importar notinha</span>
          <span className="mt-2 text-sm text-muted-foreground">
            Cupom, recibo ou pedido em PDF ou foto — os itens saem do estoque de uma vez.
          </span>
        </button>
      </div>

      {readNote.isPending ? (
        <div className="mt-8 flex flex-col items-center gap-3">
          <BoxSpinner size={32} />
          <p className="text-center text-sm text-muted-foreground">Lendo a notinha…</p>
        </div>
      ) : null}

      {lines ? (
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="label-caps">Conferência</p>
              <h2 className="mt-2 text-3xl">{lines.length} item(ns) para dar baixa</h2>
            </div>
            <div className="text-right">
              <label className="label-caps" htmlFor="total-venda">
                Total da venda
              </label>
              <input
                id="total-venda"
                type="number"
                step="0.01"
                min="0"
                value={totalDraft}
                onChange={(event) => applyTotal(event.target.value)}
                className={`mt-2 w-40 text-right ${inputClass}`}
              />
              <p className="mt-1 text-xs text-muted-foreground">Mudar aqui redivide entre os itens</p>
            </div>
          </div>

          <div className="paper-panel mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="label-caps px-4 py-3 font-normal">Produto</th>
                  <th className="label-caps px-3 py-3 font-normal">Qtd.</th>
                  <th className="label-caps px-3 py-3 font-normal">Valor un.</th>
                  <th className="label-caps px-3 py-3 text-right font-normal">Subtotal</th>
                  <th className="label-caps px-3 py-3 text-right font-normal">Lucro</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const product = productById.get(line.productId);
                  const lineProfit = product ? (line.unit_price - product.purchase_price) * line.quantity : 0;
                  const short = product ? line.quantity > product.quantity : false;
                  return (
                    <tr key={line.key} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <ProductPicker
                          products={products}
                          value={line.productId}
                          onChange={(productId) => update(line.key, { productId })}
                          fallbackLabel={line.label}
                          className="min-w-52"
                        />
                        {!line.productId ? (
                          <p className="mt-1 text-xs text-destructive">
                            &ldquo;{line.label}&rdquo; não está no estoque
                          </p>
                        ) : short ? (
                          <p className="mt-1 text-xs text-destructive">
                            Só há {qty(product!.quantity)} un. em estoque
                          </p>
                        ) : line.note ? (
                          <p className="mt-1 text-xs text-muted-foreground">{line.note}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={line.quantity}
                          onChange={(e) => update(line.key, { quantity: Number(e.target.value) })}
                          className={`${inputClass} w-20`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.unit_price}
                          onChange={(e) => update(line.key, { unit_price: Number(e.target.value) })}
                          className={`${inputClass} w-24`}
                        />
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {currency(line.quantity * line.unit_price)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right tabular-nums ${
                          lineProfit < 0 ? "text-destructive" : "text-success"
                        }`}
                      >
                        {product ? currency(lineProfit) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() =>
                            setLines((current) => {
                              const next = current?.filter((item) => item.key !== line.key) ?? null;
                              if (next) setTotalDraft(sumOf(next).toFixed(2));
                              return next && next.length > 0 ? next : null;
                            })
                          }
                          className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                        >
                          Descartar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => register.mutate(lines)}
                disabled={register.isPending || lines.length === 0}
                className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Registrar venda
              </button>
              <button
                onClick={() => {
                  setLines(null);
                  setTotalDraft("");
                }}
                className="rounded-md border border-border-strong px-5 py-2.5 text-sm transition-colors hover:bg-secondary"
              >
                Descartar
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Total {currency(total)} · lucro{" "}
              <span className={profit < 0 ? "text-destructive" : "text-success"}>{currency(profit)}</span>
            </p>
          </div>
        </section>
      ) : null}

      {building ? (
        <SaleBuilderDialog
          products={products}
          frequentProducts={frequentProducts}
          onCancel={() => setBuilding(false)}
          onSubmit={(built: BuiltSaleLine[], builtTotal) => {
            setBuilding(false);
            openLines(
              built.map((item) => ({
                key: nextKey++,
                productId: item.product.id,
                label: item.product.name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                note: "",
              })),
              builtTotal,
              "manual",
            );
          }}
        />
      ) : null}
    </AppShell>
  );
}
