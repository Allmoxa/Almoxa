import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useId, useState, type RefObject } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { PaginationNav } from "@/components/ui/pagination-nav";
import { useEnterStore } from "@/hooks/use-store-context";
import { roleLabel, type AppRole } from "@/hooks/use-user-role";
import { createUser, deleteUser, getUserDetail, listUsers } from "@/lib/admin.functions";
import { currency, dateTime, qty, type Movement } from "@/lib/inventory";

const PAGE_SIZE = 15;

const ADMIN_SECTIONS = [
  { key: "overview", label: "Visão geral" },
  { key: "users", label: "Usuários" },
  { key: "invites", label: "Convites" },
  { key: "roles", label: "Cargos e permissões" },
  { key: "business", label: "Dados do negócio" },
  { key: "activity", label: "Histórico de atividades" },
] as const;

type SectionKey = (typeof ADMIN_SECTIONS)[number]["key"];

const formSchema = z
  .object({
    email: z.string().trim().email({ message: "E-mail inválido" }).max(255),
    password: z.string().min(6, { message: "A senha precisa de ao menos 6 caracteres" }).max(72),
    role: z.enum(["onisciente", "admin", "comissionado"]),
    storeOwnerId: z.string().uuid().nullable(),
  })
  .refine((data) => data.role !== "comissionado" || !!data.storeOwnerId, {
    message: "Escolha de qual loja o comissionado vende",
  });

const roleHint: Record<AppRole, string> = {
  onisciente: "Enxerga o estoque de todas as contas.",
  admin: "Dono do próprio estoque, com todas as funções.",
  comissionado: "Só vê o estoque da loja e registra vendas.",
};

const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring";

const sourceLabel: Record<Movement["source"], string> = {
  manual: "Manual",
  photo: "Foto",
  document: "Documento",
  adjustment: "Ajuste",
  reversal: "Estorno",
};

/** Desenha uma vez, ao entrar — pathLength do framer-motion anima via stroke-dasharray/dashoffset por baixo dos panos. */
function ScribbleUnderline({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <svg
      width="168"
      height="10"
      viewBox="0 0 168 10"
      fill="none"
      aria-hidden="true"
      className="mt-2 text-primary"
    >
      <motion.path
        d="M2 6.5C18 2 34 8.5 50 5C66 1.5 82 8 98 5.5C114 3 130 7.5 146 4C154 2.3 160 3.5 166 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={
          reduceMotion ? { duration: 0 } : { duration: 0.6, ease: "easeInOut", delay: 0.25 }
        }
      />
    </svg>
  );
}

export function AdminPanel({
  open,
  onOpenChange,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const shouldReduceMotion = useReducedMotion();
  const titleId = useId();
  const descId = useId();
  const queryClient = useQueryClient();
  const { enter } = useEnterStore();

  const [section, setSection] = useState<SectionKey>("overview");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<AppRole>("admin");
  const [newStore, setNewStore] = useState("");
  const [usersPage, setUsersPage] = useState(1);
  const [productsPage, setProductsPage] = useState(1);
  const [movementsPage, setMovementsPage] = useState(1);

  // Reabrir o painel deve começar do zero — não é um estado que a pessoa espera ver preservado.
  useEffect(() => {
    if (open) return;
    setSection("overview");
    setCreating(false);
    setSelected(null);
    setUsersPage(1);
    setProductsPage(1);
    setMovementsPage(1);
  }, [open]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listUsers(),
    enabled: open,
  });
  const users = data?.users ?? [];

  const detail = useQuery({
    queryKey: ["admin-user", selected],
    queryFn: () => getUserDetail({ data: { userId: selected! } }),
    enabled: open && selected !== null,
  });

  const openUser = (userId: string) => {
    setSelected(userId);
    setProductsPage(1);
    setMovementsPage(1);
  };

  const usersPageCount = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const currentUsersPage = Math.min(usersPage, usersPageCount);
  const usersFirstIndex = (currentUsersPage - 1) * PAGE_SIZE;
  const visibleUsers = users.slice(usersFirstIndex, usersFirstIndex + PAGE_SIZE);

  const detailProducts = detail.data?.products ?? [];
  const productsPageCount = Math.max(1, Math.ceil(detailProducts.length / PAGE_SIZE));
  const currentProductsPage = Math.min(productsPage, productsPageCount);
  const productsFirstIndex = (currentProductsPage - 1) * PAGE_SIZE;
  const visibleProducts = detailProducts.slice(productsFirstIndex, productsFirstIndex + PAGE_SIZE);

  const detailMovements = detail.data?.movements ?? [];
  const movementsPageCount = Math.max(1, Math.ceil(detailMovements.length / PAGE_SIZE));
  const currentMovementsPage = Math.min(movementsPage, movementsPageCount);
  const movementsFirstIndex = (currentMovementsPage - 1) * PAGE_SIZE;
  const visibleMovements = detailMovements.slice(
    movementsFirstIndex,
    movementsFirstIndex + PAGE_SIZE,
  );

  const addUser = useMutation({
    mutationFn: (values: z.infer<typeof formSchema>) => createUser({ data: values }),
    onSuccess: () => {
      toast.success("Usuário criado");
      setCreating(false);
      setNewRole("admin");
      setNewStore("");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Erro ao criar usuário"),
  });

  const removeUser = useMutation({
    mutationFn: (userId: string) => deleteUser({ data: { userId } }),
    onSuccess: (_, userId) => {
      toast.success("Usuário apagado");
      if (selected === userId) setSelected(null);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Erro ao apagar usuário"),
  });

  // Só quem tem estoque próprio pode receber comissionado.
  const lojas = users.filter((user) => user.role !== "comissionado");

  const totals = users.reduce(
    (acc, user) => ({
      users: acc.users + 1,
      admins: acc.admins + (user.role === "admin" ? 1 : 0),
      comissionados: acc.comissionados + (user.role === "comissionado" ? 1 : 0),
      units: acc.units + user.units,
      cost: acc.cost + user.cost,
    }),
    { users: 0, admins: 0, comissionados: 0, units: 0, cost: 0 },
  );

  const roleCounts = users.reduce(
    (acc, user) => ({ ...acc, [user.role]: (acc[user.role] ?? 0) + 1 }),
    {} as Partial<Record<AppRole, number>>,
  );

  const activityRanking = [...users]
    .filter((user) => user.movements > 0)
    .sort((a, b) => b.movements - a.movements);

  const currentUser = detail.data?.user;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: shouldReduceMotion ? 0.12 : 0.25 }}
              />
            </DialogPrimitive.Overlay>

            <div className="fixed inset-0 z-[61] flex items-center justify-center overflow-y-auto sm:p-6">
              <DialogPrimitive.Content
                asChild
                forceMount
                aria-labelledby={titleId}
                aria-describedby={descId}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  returnFocusRef.current?.focus();
                }}
              >
                <motion.div
                  className="paper-panel flex h-full w-full flex-col overflow-hidden rounded-none sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-4xl sm:rounded-2xl"
                  style={{ boxShadow: "var(--shadow-lift)" }}
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 20 }}
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0.15 }
                      : { duration: 0.42, ease: [0.22, 1, 0.36, 1] }
                  }
                >
                  <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-5">
                    <div>
                      <h2 id={titleId} className="text-2xl">
                        Painel administrativo
                      </h2>
                      <p id={descId} className="mt-1 text-sm text-muted-foreground">
                        Gerencie usuários, acessos e configurações do negócio.
                      </p>
                      <ScribbleUnderline reduceMotion={!!shouldReduceMotion} />
                    </div>
                    <DialogPrimitive.Close
                      aria-label="Fechar painel administrativo"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <X className="size-5" />
                    </DialogPrimitive.Close>
                  </div>

                  <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
                    <div className="shrink-0 border-b border-border px-4 py-3 md:hidden">
                      <select
                        value={section}
                        onChange={(event) => setSection(event.target.value as SectionKey)}
                        aria-label="Seção do painel administrativo"
                        className={inputClass}
                      >
                        {ADMIN_SECTIONS.map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <nav
                      aria-label="Seções do painel administrativo"
                      className="hidden w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-4 md:flex"
                    >
                      {ADMIN_SECTIONS.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setSection(item.key)}
                          aria-current={section === item.key ? "true" : undefined}
                          className={`min-h-11 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                            section === item.key
                              ? "bg-secondary text-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </nav>

                    <div className="flex-1 overflow-y-auto p-6">
                      {section === "overview" ? (
                        <section>
                          <h3 className="label-caps">Visão geral</h3>
                          <div className="mt-3 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
                            {[
                              { label: "Contas", value: String(totals.users) },
                              { label: "Admins", value: String(totals.admins) },
                              { label: "Comissionados", value: String(totals.comissionados) },
                              { label: "Custo total", value: currency(totals.cost) },
                            ].map((item) => (
                              <div key={item.label} className="bg-card px-5 py-5">
                                <p className="label-caps">{item.label}</p>
                                <p className="mt-2 font-display text-2xl">{item.value}</p>
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {section === "users" ? (
                        selected ? (
                          <section>
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <button
                                  type="button"
                                  onClick={() => setSelected(null)}
                                  className="label-caps text-muted-foreground transition-colors hover:text-foreground"
                                >
                                  ← Voltar
                                </button>
                                <h2 className="mt-2 text-2xl">{currentUser?.email ?? "…"}</h2>
                              </div>
                            </div>

                            {detail.isLoading ? (
                              <p className="py-10 text-center text-sm text-muted-foreground">
                                Carregando…
                              </p>
                            ) : detail.isError ? (
                              <p className="py-10 text-center text-sm text-destructive">
                                Não foi possível carregar este usuário.
                              </p>
                            ) : detail.data ? (
                              <>
                                <section className="mt-6 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
                                  {[
                                    { label: "Unidades", value: qty(detail.data.user.units) },
                                    {
                                      label: "Custo em estoque",
                                      value: currency(detail.data.user.cost),
                                    },
                                    {
                                      label: "Venda potencial",
                                      value: currency(detail.data.user.revenue),
                                    },
                                    {
                                      label: "Lucro potencial",
                                      value: currency(
                                        detail.data.user.revenue - detail.data.user.cost,
                                      ),
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
                                  <>
                                    <div className="overflow-x-auto">
                                      <table className="mt-3 w-full text-sm">
                                        <thead>
                                          <tr className="border-b border-border text-left">
                                            <th className="label-caps px-2 py-2 font-normal">
                                              Produto
                                            </th>
                                            <th className="label-caps px-2 py-2 text-right font-normal">
                                              Qtd.
                                            </th>
                                            <th className="label-caps px-2 py-2 text-right font-normal">
                                              Compra
                                            </th>
                                            <th className="label-caps px-2 py-2 text-right font-normal">
                                              Venda
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {visibleProducts.map((product) => (
                                            <tr
                                              key={product.id}
                                              className="border-b border-border last:border-0"
                                            >
                                              <td className="px-2 py-3">
                                                <p className="font-medium">{product.name}</p>
                                                <p className="font-mono text-xs text-muted-foreground">
                                                  {product.sku}
                                                </p>
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
                                    </div>
                                    {productsPageCount > 1 ? (
                                      <div className="mt-3">
                                        <PaginationNav
                                          currentPage={currentProductsPage}
                                          pageCount={productsPageCount}
                                          onChange={setProductsPage}
                                          label="Paginação de produtos do usuário"
                                        />
                                      </div>
                                    ) : null}
                                  </>
                                )}

                                <h3 className="label-caps mt-8">Movimentações</h3>
                                {detail.data.movements.length === 0 ? (
                                  <p className="py-6 text-sm text-muted-foreground">
                                    Nenhuma movimentação registrada.
                                  </p>
                                ) : (
                                  <>
                                    <div className="overflow-x-auto">
                                      <table className="mt-3 w-full text-sm">
                                        <thead>
                                          <tr className="border-b border-border text-left">
                                            <th className="label-caps px-2 py-2 font-normal">
                                              Quando
                                            </th>
                                            <th className="label-caps px-2 py-2 font-normal">
                                              Produto
                                            </th>
                                            <th className="label-caps px-2 py-2 font-normal">
                                              Tipo
                                            </th>
                                            <th className="label-caps px-2 py-2 font-normal">
                                              Origem
                                            </th>
                                            <th className="label-caps px-2 py-2 font-normal">
                                              Quem lançou
                                            </th>
                                            <th className="label-caps px-2 py-2 text-right font-normal">
                                              Qtd.
                                            </th>
                                            <th className="label-caps px-2 py-2 text-right font-normal">
                                              Valor
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {visibleMovements.map((movement) => (
                                            <tr
                                              key={movement.id}
                                              className={`border-b border-border last:border-0 ${
                                                movement.reversed_at ? "opacity-55" : ""
                                              }`}
                                            >
                                              <td className="px-2 py-3 whitespace-nowrap">
                                                {dateTime(movement.created_at)}
                                              </td>
                                              <td
                                                className={`px-2 py-3 ${movement.reversed_at ? "line-through" : ""}`}
                                              >
                                                {movement.products?.name ?? "—"}
                                              </td>
                                              <td
                                                className={`px-2 py-3 ${movement.kind === "in" ? "text-success" : "text-destructive"}`}
                                              >
                                                {movement.kind === "in" ? "Entrada" : "Saída"}
                                              </td>
                                              <td className="px-2 py-3 text-muted-foreground">
                                                {sourceLabel[movement.source]}
                                              </td>
                                              <td className="px-2 py-3 text-xs text-muted-foreground">
                                                {movement.created_by_email ?? "—"}
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
                                    </div>
                                    {movementsPageCount > 1 ? (
                                      <div className="mt-3">
                                        <PaginationNav
                                          currentPage={currentMovementsPage}
                                          pageCount={movementsPageCount}
                                          onChange={setMovementsPage}
                                          label="Paginação de movimentações do usuário"
                                        />
                                      </div>
                                    ) : null}
                                  </>
                                )}
                              </>
                            ) : null}
                          </section>
                        ) : (
                          <section>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <h3 className="label-caps">Usuários</h3>
                              <button
                                onClick={() => setCreating((v) => !v)}
                                className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                              >
                                {creating ? "Cancelar" : "Novo usuário"}
                              </button>
                            </div>

                            {creating ? (
                              <form
                                className="paper-panel mt-4 grid gap-4 p-5 sm:grid-cols-4"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const form = new FormData(event.currentTarget);
                                  const parsed = formSchema.safeParse({
                                    email: form.get("email"),
                                    password: form.get("password"),
                                    role: newRole,
                                    storeOwnerId:
                                      newRole === "comissionado" ? newStore || null : null,
                                  });
                                  if (!parsed.success) {
                                    toast.error(
                                      parsed.error.issues[0]?.message ?? "Dados inválidos",
                                    );
                                    return;
                                  }
                                  addUser.mutate(parsed.data);
                                }}
                              >
                                <div className="sm:col-span-2">
                                  <label className="label-caps" htmlFor="admin-panel-new-email">
                                    E-mail
                                  </label>
                                  <input
                                    id="admin-panel-new-email"
                                    name="email"
                                    type="email"
                                    className={`mt-2 ${inputClass}`}
                                    placeholder="pessoa@empresa.com"
                                  />
                                </div>
                                <div>
                                  <label className="label-caps" htmlFor="admin-panel-new-password">
                                    Senha provisória
                                  </label>
                                  <input
                                    id="admin-panel-new-password"
                                    name="password"
                                    type="password"
                                    autoComplete="new-password"
                                    className={`mt-2 ${inputClass}`}
                                    placeholder="mín. 6 caracteres"
                                  />
                                </div>
                                <div>
                                  <label className="label-caps" htmlFor="admin-panel-new-role">
                                    Papel
                                  </label>
                                  <select
                                    id="admin-panel-new-role"
                                    value={newRole}
                                    onChange={(event) => setNewRole(event.target.value as AppRole)}
                                    className={`mt-2 ${inputClass}`}
                                  >
                                    <option value="admin">{roleLabel.admin}</option>
                                    <option value="comissionado">{roleLabel.comissionado}</option>
                                    <option value="onisciente">{roleLabel.onisciente}</option>
                                  </select>
                                </div>

                                {newRole === "comissionado" ? (
                                  <div className="sm:col-span-2">
                                    <label className="label-caps" htmlFor="admin-panel-new-store">
                                      Vende o estoque de
                                    </label>
                                    <select
                                      id="admin-panel-new-store"
                                      value={newStore}
                                      onChange={(event) => setNewStore(event.target.value)}
                                      className={`mt-2 ${inputClass}`}
                                    >
                                      <option value="">Escolha a loja…</option>
                                      {lojas.map((loja) => (
                                        <option key={loja.id} value={loja.id}>
                                          {loja.email}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ) : null}

                                <div className="sm:col-span-4">
                                  <button
                                    type="submit"
                                    disabled={addUser.isPending}
                                    className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                                  >
                                    Criar usuário
                                  </button>
                                  <p className="mt-3 text-xs text-muted-foreground">
                                    {roleHint[newRole]} A conta já nasce com o e-mail confirmado —
                                    peça para a pessoa trocar a senha no primeiro acesso.
                                  </p>
                                </div>
                              </form>
                            ) : null}

                            {usersPageCount > 1 ? (
                              <div className="mt-6 flex items-center justify-between gap-4">
                                <p className="label-caps">
                                  {usersFirstIndex + 1}–{usersFirstIndex + visibleUsers.length} de{" "}
                                  {users.length} usuários
                                </p>
                                <PaginationNav
                                  currentPage={currentUsersPage}
                                  pageCount={usersPageCount}
                                  onChange={setUsersPage}
                                  label="Paginação de usuários"
                                />
                              </div>
                            ) : null}

                            <div
                              className={`paper-panel overflow-x-auto ${usersPageCount > 1 ? "mt-4" : "mt-6"}`}
                            >
                              {isLoading ? (
                                <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                                  Carregando…
                                </p>
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
                                      <th className="label-caps px-3 py-3 text-right font-normal">
                                        Produtos
                                      </th>
                                      <th className="label-caps px-3 py-3 text-right font-normal">
                                        Unidades
                                      </th>
                                      <th className="label-caps px-3 py-3 text-right font-normal">
                                        Custo
                                      </th>
                                      <th className="label-caps px-3 py-3 text-right font-normal">
                                        Mov.
                                      </th>
                                      <th className="px-5 py-3" />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {visibleUsers.map((user) => (
                                      <tr
                                        key={user.id}
                                        className="border-b border-border last:border-0"
                                      >
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
                                              user.role === "onisciente"
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-secondary text-muted-foreground"
                                            }`}
                                          >
                                            {roleLabel[user.role]}
                                          </span>
                                          {user.storeOwnerEmail ? (
                                            <p className="mt-1 text-xs text-muted-foreground">
                                              vende de {user.storeOwnerEmail}
                                            </p>
                                          ) : null}
                                        </td>
                                        <td className="px-3 py-4 text-right tabular-nums">
                                          {user.products}
                                        </td>
                                        <td className="px-3 py-4 text-right tabular-nums">
                                          {qty(user.units)}
                                        </td>
                                        <td className="px-3 py-4 text-right tabular-nums">
                                          {currency(user.cost)}
                                        </td>
                                        <td className="px-3 py-4 text-right tabular-nums">
                                          {user.movements}
                                        </td>
                                        <td className="px-5 py-4">
                                          <div className="flex items-center justify-end gap-2">
                                            <button
                                              onClick={() => openUser(user.id)}
                                              className="min-h-11 rounded-md border border-border-strong px-2.5 text-xs transition-colors hover:bg-secondary"
                                            >
                                              Ver estoque
                                            </button>
                                            {user.role === "comissionado" ? null : (
                                              <button
                                                onClick={() => enter.mutate(user.id)}
                                                disabled={enter.isPending}
                                                className="min-h-11 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                                              >
                                                Adentrar
                                              </button>
                                            )}
                                            <button
                                              onClick={() => {
                                                if (
                                                  confirm(
                                                    `Apagar a conta de ${user.email}? Essa ação não pode ser desfeita.`,
                                                  )
                                                )
                                                  removeUser.mutate(user.id);
                                              }}
                                              disabled={removeUser.isPending}
                                              className="min-h-11 px-1 text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                                            >
                                              Apagar
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>

                            {usersPageCount > 1 ? (
                              <div className="mt-4">
                                <PaginationNav
                                  currentPage={currentUsersPage}
                                  pageCount={usersPageCount}
                                  onChange={setUsersPage}
                                  label="Paginação de usuários"
                                />
                              </div>
                            ) : null}
                          </section>
                        )
                      ) : null}

                      {section === "invites" ? (
                        <section>
                          <h3 className="label-caps">Convites</h3>
                          <p className="mt-3 max-w-md text-sm text-muted-foreground">
                            Convite por e-mail ainda não existe no Almoxá. Por enquanto, crie o
                            acesso diretamente pela aba Usuários.
                          </p>
                        </section>
                      ) : null}

                      {section === "roles" ? (
                        <section>
                          <h3 className="label-caps">Cargos e permissões</h3>
                          <div className="mt-3 space-y-3">
                            {(Object.keys(roleLabel) as AppRole[]).map((role) => (
                              <div
                                key={role}
                                className="paper-panel flex items-start justify-between gap-4 p-4"
                              >
                                <div>
                                  <p className="font-medium">{roleLabel[role]}</p>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {roleHint[role]}
                                  </p>
                                </div>
                                <span className="label-caps shrink-0 rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">
                                  {roleCounts[role] ?? 0} conta{roleCounts[role] === 1 ? "" : "s"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {section === "business" ? (
                        <section>
                          <h3 className="label-caps">Dados do negócio</h3>
                          <p className="mt-3 max-w-md text-sm text-muted-foreground">
                            Ainda não há um cadastro de dados do negócio (razão social, endereço,
                            contato) no Almoxá.
                          </p>
                        </section>
                      ) : null}

                      {section === "activity" ? (
                        <section>
                          <h3 className="label-caps">Histórico de atividades</h3>
                          {activityRanking.length === 0 ? (
                            <p className="mt-3 text-sm text-muted-foreground">
                              Nenhuma movimentação registrada ainda.
                            </p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="mt-3 w-full text-sm">
                                <thead>
                                  <tr className="border-b border-border text-left">
                                    <th className="label-caps px-2 py-2 font-normal">Usuário</th>
                                    <th className="label-caps px-2 py-2 font-normal">Papel</th>
                                    <th className="label-caps px-2 py-2 text-right font-normal">
                                      Movimentações
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {activityRanking.map((user) => (
                                    <tr
                                      key={user.id}
                                      className="border-b border-border last:border-0"
                                    >
                                      <td className="px-2 py-3">{user.email}</td>
                                      <td className="px-2 py-3 text-muted-foreground">
                                        {roleLabel[user.role]}
                                      </td>
                                      <td className="px-2 py-3 text-right tabular-nums">
                                        {user.movements}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </section>
                      ) : null}
                    </div>
                  </div>
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
