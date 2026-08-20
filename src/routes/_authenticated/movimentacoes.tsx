import { createFileRoute } from "@tanstack/react-router";
import { requireOwner } from "@/lib/guards";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { PaginationNav } from "@/components/ui/pagination-nav";
import { useStoreContext } from "@/hooks/use-store-context";
import { supabase } from "@/integrations/supabase/client";
import { currency, dateTime, qty, type Movement } from "@/lib/inventory";

const PAGE_SIZE = 15;

export const Route = createFileRoute("/_authenticated/movimentacoes")({
  head: () => ({
    meta: [
      { title: "Movimentações — Almoxá" },
      {
        name: "description",
        content: "Histórico completo de entradas e saídas de produtos, com origem e valores.",
      },
      { property: "og:title", content: "Movimentações — Almoxá" },
      {
        property: "og:description",
        content: "Histórico completo de entradas e saídas de produtos, com origem e valores.",
      },
    ],
  }),
  beforeLoad: requireOwner,
  component: MovimentacoesPage,
});

const sourceLabel: Record<Movement["source"], string> = {
  manual: "Manual",
  photo: "Foto",
  document: "Documento",
  adjustment: "Ajuste",
  reversal: "Estorno",
  receita: "Receita",
};

const kindLabel = (kind: Movement["kind"]) => (kind === "in" ? "entrada" : "saída");

function MovimentacoesPage() {
  const queryClient = useQueryClient();
  const { storeOwnerId } = useStoreContext();
  const [reversing, setReversing] = useState<Movement | null>(null);
  const [page, setPage] = useState(1);

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movements")
        .select(
          "id, product_id, kind, quantity, unit_price, unit_cost, source, note, created_at, created_by, sold_by, reverses_id, reversed_at, products(name, sku)",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as unknown as Movement[];
    },
  });

  // Quem lançou cada movimento. store_members() devolve o dono e a equipe dele,
  // porque auth.users não é legível direto pelo cliente.
  const { data: members = [] } = useQuery({
    queryKey: ["store-members"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("store_members");
      if (error) throw error;
      return (data ?? []) as { id: string; email: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const emailById = new Map(members.map((member) => [member.id, member.email]));

  const reverse = useMutation({
    mutationFn: async (movement: Movement) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      // Só reverses_id e user_id importam: o gatilho no banco reescreve produto,
      // tipo, quantidade e valores a partir do lançamento original. O resto vai
      // aqui apenas porque as colunas são obrigatórias.
      const { error } = await supabase.from("movements").insert({
        user_id: storeOwnerId ?? userId,
        reverses_id: movement.id,
        source: "reversal",
        product_id: movement.product_id,
        kind: movement.kind === "in" ? "out" : "in",
        quantity: movement.quantity,
        unit_price: movement.unit_price,
        note: `Estorno da ${kindLabel(movement.kind)} de ${dateTime(movement.created_at)}`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento estornado e estoque corrigido");
      setReversing(null);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["frequent-sold-products"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao estornar"),
  });

  const pageCount = Math.max(1, Math.ceil(movements.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * PAGE_SIZE;
  const visible = useMemo(
    () => movements.slice(firstIndex, firstIndex + PAGE_SIZE),
    [movements, firstIndex],
  );

  return (
    <AppShell
      title="Movimentações"
      description="Toda entrada e saída registrada, com a origem de cada lançamento. Lançou errado? Estorne — o histórico guarda os dois."
    >
      {pageCount > 1 ? (
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="label-caps">
            {firstIndex + 1}–{firstIndex + visible.length} de {movements.length} movimentações
          </p>
          <PaginationNav
            currentPage={currentPage}
            pageCount={pageCount}
            onChange={setPage}
            label="Paginação das movimentações"
          />
        </div>
      ) : null}

      <div className="paper-panel overflow-x-auto">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10">
            <BoxSpinner />
            <p className="text-center text-sm text-muted-foreground">Carregando…</p>
          </div>
        ) : movements.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Nenhuma movimentação registrada ainda.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label-caps px-5 py-3 font-normal">Quando</th>
                <th className="label-caps px-3 py-3 font-normal">Produto</th>
                <th className="label-caps px-3 py-3 font-normal">Tipo</th>
                <th className="label-caps px-3 py-3 font-normal">Origem</th>
                <th className="label-caps px-3 py-3 font-normal">Quem lançou</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Qtd.</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Valor</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((movement) => {
                const estornado = !!movement.reversed_at;
                const ehEstorno = movement.source === "reversal";
                return (
                  <tr
                    key={movement.id}
                    className={`border-b border-border last:border-0 ${estornado ? "opacity-55" : ""}`}
                  >
                    <td className="px-5 py-4 text-muted-foreground">
                      {dateTime(movement.created_at)}
                    </td>
                    <td className="px-3 py-4">
                      <p className={`font-medium ${estornado ? "line-through" : ""}`}>
                        {movement.products?.name ?? "Produto removido"}
                      </p>
                      {movement.note ? (
                        <p className="text-xs text-muted-foreground">{movement.note}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-4">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs ${
                          movement.kind === "in"
                            ? "bg-secondary text-success"
                            : "bg-secondary text-destructive"
                        }`}
                      >
                        {movement.kind === "in" ? "Entrada" : "Saída"}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-muted-foreground">
                      {sourceLabel[movement.source]}
                    </td>
                    <td className="px-3 py-4 text-xs text-muted-foreground">
                      {movement.sold_by ? (emailById.get(movement.sold_by) ?? "—") : "—"}
                      {movement.sold_by &&
                      movement.created_by &&
                      movement.sold_by !== movement.created_by ? (
                        <span className="block">
                          registrado por {emailById.get(movement.created_by) ?? "—"}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-4 text-right tabular-nums">{qty(movement.quantity)}</td>
                    <td className="px-3 py-4 text-right tabular-nums">
                      {currency(movement.quantity * movement.unit_price)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {estornado ? (
                        <span className="label-caps rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">
                          Estornado
                        </span>
                      ) : ehEstorno ? null : (
                        <button
                          onClick={() => setReversing(movement)}
                          className="rounded-md border border-border-strong px-2.5 py-1 text-xs whitespace-nowrap transition-colors hover:bg-secondary"
                        >
                          Estornar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pageCount > 1 ? (
        <div className="mt-6">
          <PaginationNav
            currentPage={currentPage}
            pageCount={pageCount}
            onChange={setPage}
            label="Paginação das movimentações"
          />
        </div>
      ) : null}

      {reversing ? (
        <ReversalDialog
          movement={reversing}
          pending={reverse.isPending}
          onCancel={() => setReversing(null)}
          onConfirm={() => reverse.mutate(reversing)}
        />
      ) : null}
    </AppShell>
  );
}

function ReversalDialog({
  movement,
  pending,
  onCancel,
  onConfirm,
}: {
  movement: Movement;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const devolve = movement.kind === "out";
  const produto = movement.products?.name ?? "produto removido";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/25 px-6">
      <div className="paper-panel w-full max-w-md p-6" style={{ boxShadow: "var(--shadow-lift)" }}>
        <p className="label-caps">Estornar lançamento</p>
        <h2 className="mt-2 text-2xl">{produto}</h2>
        <p className="text-xs text-muted-foreground">
          {movement.kind === "in" ? "Entrada" : "Saída"} de {qty(movement.quantity)} un. em{" "}
          {dateTime(movement.created_at)} — {currency(movement.quantity * movement.unit_price)}
        </p>

        <p className="mt-5 text-sm">
          {devolve ? (
            <>
              Vão voltar <span className="font-medium">{qty(movement.quantity)} un.</span> para o
              estoque, e o lucro desta venda sai das contas.
            </>
          ) : (
            <>
              Vão sair <span className="font-medium">{qty(movement.quantity)} un.</span> do estoque.
              Se a mercadoria já foi vendida, o estorno é recusado para o saldo não ficar negativo.
            </>
          )}
        </p>

        <p className="mt-3 text-xs text-muted-foreground">
          Nada é apagado: o lançamento continua no histórico marcado como estornado, com o estorno
          registrado ao lado.
        </p>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Estornando…" : "Confirmar estorno"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border-strong px-4 py-2 text-sm transition-colors hover:bg-secondary"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
