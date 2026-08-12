import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { roleLabel } from "@/hooks/use-user-role";
import { supabase } from "@/integrations/supabase/client";
import { createUser, getUserDetail, listUsers } from "@/lib/admin.functions";
import { currency, dateTime, qty, type Movement } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Almoxá" },
      {
        name: "description",
        content: "Painel do administrador: usuários, acessos e estoque de cada conta.",
      },
    ],
  }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!data) throw redirect({ to: "/estoque" });
  },
  component: AdminPage,
});

const formSchema = z.object({
  email: z.string().trim().email({ message: "E-mail inválido" }).max(255),
  password: z.string().min(6, { message: "A senha precisa de ao menos 6 caracteres" }).max(72),
  admin: z.boolean(),
});

const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring";

const sourceLabel: Record<Movement["source"], string> = {
  manual: "Manual",
  photo: "Foto",
  document: "Documento",
};

function AdminPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listUsers(),
  });
  const users = data?.users ?? [];

  const detail = useQuery({
    queryKey: ["admin-user", selected],
    queryFn: () => getUserDetail({ data: { userId: selected! } }),
    enabled: selected !== null,
  });

  const addUser = useMutation({
    mutationFn: (values: z.infer<typeof formSchema>) => createUser({ data: values }),
    onSuccess: () => {
      toast.success("Usuário criado");
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Erro ao criar usuário"),
  });

  const totals = users.reduce(
    (acc, user) => ({
      users: acc.users + 1,
      admins: acc.admins + (user.role === "admin" ? 1 : 0),
      units: acc.units + user.units,
      cost: acc.cost + user.cost,
    }),
    { users: 0, admins: 0, units: 0, cost: 0 },
  );

  return (
    <AppShell
      title="Admin"
      description="Crie acessos e acompanhe o estoque de cada conta da plataforma."
      action={
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {creating ? "Cancelar" : "Novo usuário"}
        </button>
      }
    >
      <section className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        {[
          { label: "Usuários", value: String(totals.users) },
          { label: "Administradores", value: String(totals.admins) },
          { label: "Unidades em estoque", value: qty(totals.units) },
          { label: "Custo total", value: currency(totals.cost) },
        ].map((item) => (
          <div key={item.label} className="bg-card px-5 py-5">
            <p className="label-caps">{item.label}</p>
            <p className="mt-2 font-display text-2xl">{item.value}</p>
          </div>
        ))}
      </section>

      {creating ? (
        <form
          className="paper-panel mt-6 grid gap-4 p-5 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const parsed = formSchema.safeParse({
              email: form.get("email"),
              password: form.get("password"),
              admin: form.get("admin") === "on",
            });
            if (!parsed.success) {
              toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
              return;
            }
            addUser.mutate(parsed.data);
          }}
        >
          <div className="sm:col-span-2">
            <label className="label-caps" htmlFor="new-email">
              E-mail
            </label>
            <input
              id="new-email"
              name="email"
              type="email"
              className={`mt-2 ${inputClass}`}
              placeholder="pessoa@empresa.com"
            />
          </div>
          <div>
            <label className="label-caps" htmlFor="new-password">
              Senha provisória
            </label>
            <input
              id="new-password"
              name="password"
              type="text"
              className={`mt-2 ${inputClass}`}
              placeholder="mín. 6 caracteres"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-2 text-sm" htmlFor="new-admin">
              <input
                id="new-admin"
                name="admin"
                type="checkbox"
                className="size-4 accent-primary"
              />
              Administrador
            </label>
          </div>
          <div className="sm:col-span-4">
            <button
              type="submit"
              disabled={addUser.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Criar usuário
            </button>
            <p className="mt-3 text-xs text-muted-foreground">
              A conta já nasce com o e-mail confirmado. Peça para a pessoa trocar a senha no
              primeiro acesso.
            </p>
          </div>
        </form>
      ) : null}

      <div className="paper-panel mt-10 overflow-hidden">
        {isLoading ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : users.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Nenhum usuário cadastrado.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label-caps px-5 py-3 font-normal">Usuário</th>
                <th className="label-caps px-3 py-3 font-normal">Papel</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Produtos</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Unidades</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Custo</th>
                <th className="label-caps px-3 py-3 text-right font-normal">Mov.</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-4">
                    <p className="font-medium">{user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Desde {dateTime(user.created_at)}
                      {user.last_sign_in_at
                        ? ` · último acesso ${dateTime(user.last_sign_in_at)}`
                        : " · nunca acessou"}
                    </p>
                  </td>
                  <td className="px-3 py-4">
                    <span
                      className={`label-caps rounded-full px-2.5 py-1 ${
                        user.role === "admin"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {roleLabel[user.role]}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums">{user.products}</td>
                  <td className="px-3 py-4 text-right tabular-nums">{qty(user.units)}</td>
                  <td className="px-3 py-4 text-right tabular-nums">{currency(user.cost)}</td>
                  <td className="px-3 py-4 text-right tabular-nums">{user.movements}</td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => setSelected(user.id)}
                      className="rounded-md border border-border-strong px-2.5 py-1 text-xs transition-colors hover:bg-secondary"
                    >
                      Ver estoque
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-foreground/25 px-6 py-10">
          <div
            className="paper-panel w-full max-w-3xl p-6"
            style={{ boxShadow: "var(--shadow-lift)" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="label-caps">Estoque do usuário</p>
                <h2 className="mt-2 text-2xl">{detail.data?.user.email ?? "…"}</h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-md border border-border-strong px-3 py-1.5 text-sm transition-colors hover:bg-secondary"
              >
                Fechar
              </button>
            </div>

            {detail.isLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : detail.isError ? (
              <p className="py-10 text-center text-sm text-destructive">
                Não foi possível carregar este usuário.
              </p>
            ) : detail.data ? (
              <>
                <section className="mt-6 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
                  {[
                    { label: "Unidades", value: qty(detail.data.user.units) },
                    { label: "Custo em estoque", value: currency(detail.data.user.cost) },
                    { label: "Venda potencial", value: currency(detail.data.user.revenue) },
                    {
                      label: "Lucro potencial",
                      value: currency(detail.data.user.revenue - detail.data.user.cost),
                    },
                  ].map((item) => (
                    <div key={item.label} className="bg-card px-4 py-4">
                      <p className="label-caps">{item.label}</p>
                      <p className="mt-1 font-display text-xl">{item.value}</p>
                    </div>
                  ))}
                </section>

                <h3 className="label-caps mt-8">Produtos</h3>
                {detail.data.products.length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">
                    Este usuário ainda não cadastrou produtos.
                  </p>
                ) : (
                  <table className="mt-3 w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="label-caps px-2 py-2 font-normal">Produto</th>
                        <th className="label-caps px-2 py-2 text-right font-normal">Qtd.</th>
                        <th className="label-caps px-2 py-2 text-right font-normal">Compra</th>
                        <th className="label-caps px-2 py-2 text-right font-normal">Venda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.data.products.map((product) => (
                        <tr key={product.id} className="border-b border-border last:border-0">
                          <td className="px-2 py-3">
                            <p className="font-medium">{product.name}</p>
                            <p className="font-mono text-xs text-muted-foreground">{product.sku}</p>
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums">
                            {qty(product.quantity)}
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums">
                            {currency(product.purchase_price)}
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums">
                            {currency(product.sale_price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <h3 className="label-caps mt-8">Movimentações</h3>
                {detail.data.movements.length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">
                    Nenhuma movimentação registrada.
                  </p>
                ) : (
                  <table className="mt-3 w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="label-caps px-2 py-2 font-normal">Quando</th>
                        <th className="label-caps px-2 py-2 font-normal">Produto</th>
                        <th className="label-caps px-2 py-2 font-normal">Tipo</th>
                        <th className="label-caps px-2 py-2 font-normal">Origem</th>
                        <th className="label-caps px-2 py-2 text-right font-normal">Qtd.</th>
                        <th className="label-caps px-2 py-2 text-right font-normal">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.data.movements.map((movement) => (
                        <tr key={movement.id} className="border-b border-border last:border-0">
                          <td className="px-2 py-3 whitespace-nowrap">
                            {dateTime(movement.created_at)}
                          </td>
                          <td className="px-2 py-3">{movement.products?.name ?? "—"}</td>
                          <td
                            className={`px-2 py-3 ${movement.kind === "in" ? "text-success" : "text-destructive"}`}
                          >
                            {movement.kind === "in" ? "Entrada" : "Saída"}
                          </td>
                          <td className="px-2 py-3 text-muted-foreground">
                            {sourceLabel[movement.source]}
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums">
                            {qty(movement.quantity)}
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums">
                            {currency(movement.quantity * movement.unit_price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
