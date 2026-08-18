import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { supabase } from "@/integrations/supabase/client";
import { currency, qty } from "@/lib/inventory";

/** O que o comissionado enxerga — sem preço de compra, sem lucro, sem totais. */
export type StoreProduct = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  sale_price: number;
};

/**
 * Estoque da loja pelos olhos do comissionado.
 *
 * Os dados vêm de store_products(), não da tabela: a RLS de products não devolve
 * linha nenhuma para ele, e a função é SECURITY DEFINER e só seleciona estas
 * quatro colunas. Custo e lucro não chegam nem a sair do servidor — esconder
 * coluna no React esconderia da vista, não do DevTools.
 */
function useStoreProducts() {
  return useQuery({
    queryKey: ["store-products"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("store_products");
      if (error) throw error;
      return (data ?? []) as StoreProduct[];
    },
  });
}

const PAGE_SIZE = 25;

export function StoreStockView() {
  const { data: products = [], isLoading } = useStoreProducts();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term),
    );
  }, [products, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(firstIndex, firstIndex + PAGE_SIZE);

  return (
    <AppShell
      title="Estoque da loja"
      description="O que está disponível para vender hoje. Para registrar uma saída, use a tela Vender."
    >
      <div className="flex items-center justify-between gap-4">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
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

      <div className="paper-panel mt-4 overflow-x-auto">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10">
            <BoxSpinner />
            <p className="text-center text-sm text-muted-foreground">Carregando…</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            {products.length === 0
              ? "A loja ainda não tem produtos cadastrados."
              : "Nenhum produto com esse nome ou código."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label-caps px-5 py-3 font-normal">Produto</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Disponível</th>
                <th className="label-caps px-5 py-3 text-right font-normal">Preço</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((product) => (
                <tr key={product.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-4">
                    <p className="font-medium">{product.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{product.sku}</p>
                  </td>
                  <td
                    className={`px-3 py-4 text-right tabular-nums ${
                      product.quantity <= 0 ? "text-destructive" : ""
                    }`}
                  >
                    {product.quantity <= 0 ? "acabou" : qty(product.quantity)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums">
                    {currency(product.sale_price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pageCount > 1 ? (
        <nav
          aria-label="Paginação do estoque"
          className="mt-6 flex items-center justify-center gap-1.5"
        >
          <button
            type="button"
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm transition-colors hover:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Anterior
          </button>
          <span className="px-2 text-sm text-muted-foreground tabular-nums">
            {currentPage} de {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage === pageCount}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm transition-colors hover:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Próxima
          </button>
        </nav>
      ) : null}
    </AppShell>
  );
}
