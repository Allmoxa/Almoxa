import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/use-user-role";

/**
 * Papéis do usuário logado, para os `beforeLoad` das rotas.
 *
 * Esconder o item no menu não fecha a porta: sem estes guardas, digitar
 * /dashboard na barra de endereços entregaria custo e lucro ao comissionado.
 * A RLS já barra os dados no banco, mas a tela chegaria a renderizar vazia,
 * o que é confuso — melhor devolver a pessoa para onde ela tem o que fazer.
 */
async function rolesOf(): Promise<AppRole[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw redirect({ to: "/auth" });

  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((row) => row.role);
}

/** Dono do estoque: admin ou onisciente. Fecha a tela para o comissionado. */
export async function requireOwner() {
  const roles = await rolesOf();
  const owner = roles.includes("admin") || roles.includes("onisciente");
  if (!owner) throw redirect({ to: "/estoque" });
}

export async function requireOnisciente() {
  const roles = await rolesOf();
  if (!roles.includes("onisciente")) throw redirect({ to: "/estoque" });
}
