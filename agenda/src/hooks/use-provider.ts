import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Provider } from "@/integrations/supabase/types";

/**
 * Cadastro do prestador logado.
 *
 * A linha é criada pelo gatilho `handle_new_provider` no primeiro cadastro,
 * então aqui ela sempre existe — a não ser em conta feita antes desta
 * migration, caso em que a tela mostra o aviso em vez de quebrar.
 *
 * A RLS já filtra por `user_id = auth.uid()`, então não há `.eq("user_id",…)`
 * aqui: o banco não devolveria a linha de outra pessoa mesmo se pedisse.
 */
export function useProvider() {
  return useQuery({
    queryKey: ["provider"],
    queryFn: async (): Promise<Provider | null> => {
      const { data, error } = await supabase.from("providers").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
    // O cadastro muda pouco e várias telas dependem dele; refazer a consulta a
    // cada troca de aba só gastaria requisição.
    staleTime: 60_000,
  });
}
