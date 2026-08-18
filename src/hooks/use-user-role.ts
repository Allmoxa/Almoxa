import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const roleLabel: Record<AppRole, string> = {
  onisciente: "Onisciente",
  admin: "Admin",
  comissionado: "Comissionado",
};

/** Do mais poderoso para o menos: quem acumula papéis responde pelo maior. */
const ROLE_RANK: AppRole[] = ["onisciente", "admin", "comissionado"];

export type UserRole = {
  role: AppRole | undefined;
  /** De quem é o estoque que esta pessoa movimenta — o dono, se for comissionado. */
  storeOwnerId: string | null;
  userId: string | null;
  isOnisciente: boolean;
  isAdmin: boolean;
  isComissionado: boolean;
  isLoading: boolean;
};

/**
 * Papel do usuário logado. A RLS deixa cada um ler apenas os próprios papéis.
 *
 * Quem foi promovido a onisciente mantém a linha de admin de antes, então o
 * papel exibido é o mais alto que a pessoa tem — não o primeiro que voltar.
 */
export function useUserRole(): UserRole {
  const query = useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");
      const { data, error } = await supabase
        .from("user_roles")
        .select("role, store_owner_id")
        .eq("user_id", userId);
      if (error) throw error;

      const role = ROLE_RANK.find((candidate) => data.some((row) => row.role === candidate));
      const comissionado = data.find((row) => row.role === "comissionado");
      return {
        role: role ?? ("admin" as AppRole),
        storeOwnerId: comissionado?.store_owner_id ?? null,
        userId,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    role: query.data?.role,
    storeOwnerId: query.data?.storeOwnerId ?? null,
    userId: query.data?.userId ?? null,
    isOnisciente: query.data?.role === "onisciente",
    isAdmin: query.data?.role === "onisciente" || query.data?.role === "admin",
    isComissionado: query.data?.role === "comissionado",
    isLoading: query.isLoading,
  };
}
