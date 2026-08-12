import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const roleLabel: Record<AppRole, string> = {
  admin: "Administrador",
  user: "Usuário",
};

/** Papel do usuário logado. A RLS deixa cada um ler apenas os próprios papéis. */
export function useUserRole() {
  const query = useQuery({
    queryKey: ["user-role"],
    queryFn: async (): Promise<AppRole> => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error) throw error;
      return data.some((row) => row.role === "admin") ? "admin" : "user";
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    role: query.data,
    isAdmin: query.data === "admin",
    isLoading: query.isLoading,
  };
}
