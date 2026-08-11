import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { currency, dateTime, qty, type Movement } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/movimentacoes")({
  head: () => ({
    meta: [
      { title: "Movimentações — Almoxá" },
      { name: "description", content: "Histórico completo de entradas e saídas de produtos, com origem e valores." },
      { property: "og:title", content: "Movimentações — Almoxá" },
      {
        property: "og:description",
        content: "Histórico completo de entradas e saídas de produtos, com origem e valores.",
      },
    ],
  }),
  component: MovimentacoesPage,
});

const sourceLabel: Record<Movement["source"], string> = {
  manual: "Manual",
  photo: "Foto",
  document: "Documento",
};

function MovimentacoesPage() {
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movements")
        .select("id, product_id, kind, quantity, unit_price, source, note, created_at, products(name, sku)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as unknown as Movement[];
    },
  });

  return (
    <AppShell title="Movimentações" description="Toda entrada e saída registrada, com a origem de cada lançamento.">
      <div className="paper-panel overflow-hidden">
        {isLoading ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : movements.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">Nenhuma movimentação registrada ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label-caps px-5 py-3 font-normal">Quando</th>
                <th className="label-caps px-3 py-3 font-normal">Produto</th>
                <th className="label-caps px-3 py-3 font-normal">Tipo</th>
                <th className="label-caps px-3 py-3 font-normal">Origem</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Qtd.</th>
                <th className="label-caps px-5 py-3 text-right font-normal">Valor</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-4 text-muted-foreground">{dateTime(movement.created_at)}</td>
                  <td className="px-3 py-4">
                    <p className="font-medium">{movement.products?.name ?? "Produto removido"}</p>
                    {movement.note ? <p className="text-xs text-muted-foreground">{movement.note}</p> : null}
                  </td>
                  <td className="px-3 py-4">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs ${
                        movement.kind === "in" ? "bg-secondary text-success" : "bg-secondary text-destructive"
                      }`}
                    >
                      {movement.kind === "in" ? "Entrada" : "Saída"}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-muted-foreground">{sourceLabel[movement.source]}</td>
                  <td className="px-3 py-4 text-right tabular-nums">{qty(movement.quantity)}</td>
                  <td className="px-5 py-4 text-right tabular-nums">
                    {currency(movement.quantity * movement.unit_price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
