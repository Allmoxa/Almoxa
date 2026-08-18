import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AppRole } from "@/hooks/use-user-role";
import type { Movement, Product } from "@/lib/inventory";

export type AdminUser = {
  id: string;
  email: string;
  role: AppRole;
  /** Só para comissionado: de quem é o estoque que ele vende. */
  storeOwnerId: string | null;
  storeOwnerEmail: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  products: number;
  units: number;
  cost: number;
  revenue: number;
  movements: number;
};

export type AdminUserDetail = {
  user: AdminUser;
  products: Product[];
  movements: Movement[];
};

const createUserSchema = z
  .object({
    email: z.string().trim().email({ message: "E-mail inválido" }).max(255),
    password: z.string().min(6, { message: "A senha precisa de ao menos 6 caracteres" }).max(72),
    role: z.enum(["onisciente", "admin", "comissionado"]),
    storeOwnerId: z.string().uuid().nullable().default(null),
  })
  .refine((data) => data.role !== "comissionado" || !!data.storeOwnerId, {
    message: "Escolha de qual loja o comissionado vende",
    path: ["storeOwnerId"],
  });

const userIdSchema = z.object({ userId: z.string().uuid() });

// supabaseAdmin ignora RLS, então todo handler daqui começa por aqui: o middleware
// garante que há sessão, esta função garante que a sessão é de um onisciente.
async function requireOnisciente(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "onisciente")
    .maybeSingle();
  if (error) throw new Error("Não foi possível validar suas permissões.");
  if (!data) throw new Error("Acesso restrito ao onisciente.");
  return supabaseAdmin;
}

type AdminClient = Awaited<ReturnType<typeof requireOnisciente>>;

async function listAdminUsers(supabaseAdmin: AdminClient): Promise<AdminUser[]> {
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (authError) throw new Error("Não foi possível carregar os usuários.");

  const [roles, products, movements] = await Promise.all([
    supabaseAdmin.from("user_roles").select("user_id, role, store_owner_id"),
    supabaseAdmin.from("products").select("user_id, quantity, purchase_price, sale_price"),
    supabaseAdmin.from("movements").select("user_id"),
  ]);
  if (roles.error || products.error || movements.error)
    throw new Error("Não foi possível carregar os dados dos usuários.");

  const emailById = new Map(authData.users.map((user) => [user.id, user.email ?? "—"]));

  // Quem foi promovido guarda também a linha do papel anterior, então vale o
  // mais alto — a mesma regra que o app usa no menu.
  const rank: AppRole[] = ["onisciente", "admin", "comissionado"];
  const roleOf = new Map<string, AppRole>();
  const storeOf = new Map<string, string>();
  for (const row of roles.data) {
    const current = roleOf.get(row.user_id);
    if (!current || rank.indexOf(row.role) < rank.indexOf(current)) {
      roleOf.set(row.user_id, row.role);
    }
    if (row.role === "comissionado" && row.store_owner_id) {
      storeOf.set(row.user_id, row.store_owner_id);
    }
  }

  const movementCount = new Map<string, number>();
  for (const row of movements.data) {
    movementCount.set(row.user_id, (movementCount.get(row.user_id) ?? 0) + 1);
  }

  return authData.users.map((user) => {
    const owned = products.data.filter((product) => product.user_id === user.id);
    const storeOwnerId = storeOf.get(user.id) ?? null;
    return {
      id: user.id,
      email: user.email ?? "—",
      role: roleOf.get(user.id) ?? ("admin" as AppRole),
      storeOwnerId,
      storeOwnerEmail: storeOwnerId ? (emailById.get(storeOwnerId) ?? null) : null,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null,
      products: owned.length,
      units: owned.reduce((sum, product) => sum + Number(product.quantity), 0),
      cost: owned.reduce(
        (sum, product) => sum + Number(product.quantity) * Number(product.purchase_price),
        0,
      ),
      revenue: owned.reduce(
        (sum, product) => sum + Number(product.quantity) * Number(product.sale_price),
        0,
      ),
      movements: movementCount.get(user.id) ?? 0,
    };
  });
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ users: AdminUser[] }> => {
    const supabaseAdmin = await requireOnisciente(context.userId);
    return { users: await listAdminUsers(supabaseAdmin) };
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createUserSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    // O onisciente cria qualquer conta. O dono de loja também contrata, mas só
    // comissionado e só para a própria loja — senão ele se promoveria a
    // onisciente criando uma conta e entrando nela.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: papeis, error: papeisError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (papeisError) throw new Error("Não foi possível validar suas permissões.");

    const onisciente = papeis.some((row) => row.role === "onisciente");
    const donoDaLoja =
      papeis.some((row) => row.role === "admin") &&
      data.role === "comissionado" &&
      data.storeOwnerId === context.userId;

    if (!onisciente && !donoDaLoja) {
      throw new Error("Você não pode criar este tipo de conta.");
    }

    // Comissionado precisa de uma loja que exista e que seja de um dono de fato.
    if (data.role === "comissionado") {
      const { data: owner, error: ownerError } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("user_id", data.storeOwnerId!)
        .in("role", ["admin", "onisciente"])
        .limit(1)
        .maybeSingle();
      if (ownerError) throw new Error("Não foi possível validar a loja escolhida.");
      if (!owner) throw new Error("A loja escolhida não pertence a um admin.");
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error || !created.user) {
      throw new Error(error?.message ?? "Não foi possível criar o usuário.");
    }

    // O gatilho em auth.users já deixa a conta como 'admin' — dona do próprio
    // estoque. Comissionado é o oposto disso, então essa linha sai.
    if (data.role === "comissionado") {
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", created.user.id)
        .eq("role", "admin");
    }

    if (data.role !== "admin") {
      const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
        user_id: created.user.id,
        role: data.role,
        store_owner_id: data.role === "comissionado" ? data.storeOwnerId : null,
      });
      if (roleError)
        throw new Error(`Usuário criado, mas o papel não foi aplicado: ${roleError.message}`);
    }

    return { id: created.user.id };
  });

export const getUserDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => userIdSchema.parse(data))
  .handler(async ({ data, context }): Promise<AdminUserDetail> => {
    const supabaseAdmin = await requireOnisciente(context.userId);

    const users = await listAdminUsers(supabaseAdmin);
    const user = users.find((item) => item.id === data.userId);
    if (!user) throw new Error("Usuário não encontrado.");

    const [products, movements] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id, name, sku, quantity, purchase_price, sale_price, notes, created_at")
        .eq("user_id", data.userId)
        .order("name"),
      supabaseAdmin
        .from("movements")
        .select(
          "id, product_id, kind, quantity, unit_price, unit_cost, source, note, created_at, created_by, reverses_id, reversed_at, products(name, sku)",
        )
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);
    if (products.error || movements.error)
      throw new Error("Não foi possível carregar o estoque deste usuário.");

    // Quem lançou pode ser um comissionado desta loja. O e-mail sai de users, que
    // só o service_role alcança — por isso ele é resolvido aqui, e não na tela.
    const emailById = new Map(users.map((item) => [item.id, item.email]));

    return {
      user,
      products: products.data as Product[],
      movements: (movements.data as Movement[]).map((movement) => ({
        ...movement,
        created_by_email: movement.created_by ? (emailById.get(movement.created_by) ?? null) : null,
      })),
    };
  });
