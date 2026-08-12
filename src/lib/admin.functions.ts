import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AppRole } from "@/hooks/use-user-role";
import type { Movement, Product } from "@/lib/inventory";

export type AdminUser = {
  id: string;
  email: string;
  role: AppRole;
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

const createUserSchema = z.object({
  email: z.string().trim().email({ message: "E-mail inválido" }).max(255),
  password: z.string().min(6, { message: "A senha precisa de ao menos 6 caracteres" }).max(72),
  admin: z.boolean().default(false),
});

const userIdSchema = z.object({ userId: z.string().uuid() });

// supabaseAdmin ignora RLS, então todo handler daqui começa por aqui: o middleware
// garante que há sessão, esta função garante que a sessão é de um administrador.
async function requireAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Não foi possível validar suas permissões.");
  if (!data) throw new Error("Acesso restrito a administradores.");
  return supabaseAdmin;
}

type AdminClient = Awaited<ReturnType<typeof requireAdmin>>;

async function listAdminUsers(supabaseAdmin: AdminClient): Promise<AdminUser[]> {
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (authError) throw new Error("Não foi possível carregar os usuários.");

  const [roles, products, movements] = await Promise.all([
    supabaseAdmin.from("user_roles").select("user_id, role"),
    supabaseAdmin.from("products").select("user_id, quantity, purchase_price, sale_price"),
    supabaseAdmin.from("movements").select("user_id"),
  ]);
  if (roles.error || products.error || movements.error)
    throw new Error("Não foi possível carregar os dados dos usuários.");

  const adminIds = new Set(
    roles.data.filter((row) => row.role === "admin").map((row) => row.user_id),
  );
  const movementCount = new Map<string, number>();
  for (const row of movements.data) {
    movementCount.set(row.user_id, (movementCount.get(row.user_id) ?? 0) + 1);
  }

  return authData.users.map((user) => {
    const owned = products.data.filter((product) => product.user_id === user.id);
    return {
      id: user.id,
      email: user.email ?? "—",
      role: adminIds.has(user.id) ? ("admin" as const) : ("user" as const),
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
    const supabaseAdmin = await requireAdmin(context.userId);
    return { users: await listAdminUsers(supabaseAdmin) };
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createUserSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const supabaseAdmin = await requireAdmin(context.userId);

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error || !created.user) {
      throw new Error(error?.message ?? "Não foi possível criar o usuário.");
    }

    // O papel 'user' vem do trigger em auth.users; só o de admin precisa ser gravado.
    if (data.admin) {
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: created.user.id, role: "admin" });
      if (roleError)
        throw new Error("Usuário criado, mas não foi possível torná-lo administrador.");
    }

    return { id: created.user.id };
  });

export const getUserDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => userIdSchema.parse(data))
  .handler(async ({ data, context }): Promise<AdminUserDetail> => {
    const supabaseAdmin = await requireAdmin(context.userId);

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
          "id, product_id, kind, quantity, unit_price, source, note, created_at, products(name, sku)",
        )
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);
    if (products.error || movements.error)
      throw new Error("Não foi possível carregar o estoque deste usuário.");

    return {
      user,
      products: products.data as Product[],
      movements: movements.data as unknown as Movement[],
    };
  });
