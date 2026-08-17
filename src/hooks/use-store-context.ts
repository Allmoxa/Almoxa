import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type StoreContext = {
  /** Dono do estoque em que a pessoa opera agora. */
  storeOwnerId: string | null;
  storeEmail: string | null;
  /** true quando é a loja de outra pessoa — o onisciente adentrou. */
  entered: boolean;
};

/**
 * Em qual loja a pessoa está operando.
 *
 * Para o admin é sempre a dele. Para o onisciente é a que ele adentrou, e é o
 * banco que decide isso: a RLS de products e movements passou a comparar com
 * operating_store(), então as telas continuam consultando do mesmo jeito e já
 * vêm limitadas à loja certa. O que ainda precisa deste hook são os INSERTs,
 * que gravam user_id explicitamente.
 */
export function useStoreContext() {
  const query = useQuery({
    queryKey: ["store-context"],
    queryFn: async (): Promise<StoreContext> => {
      const { data, error } = await supabase.rpc("current_context");
      if (error) throw error;
      const row = (data ?? [])[0];
      return {
        storeOwnerId: row?.store_owner_id ?? null,
        storeEmail: row?.store_email ?? null,
        entered: !!row?.entered,
      };
    },
    staleTime: 60 * 1000,
  });

  return {
    storeOwnerId: query.data?.storeOwnerId ?? null,
    storeEmail: query.data?.storeEmail ?? null,
    entered: query.data?.entered ?? false,
    isLoading: query.isLoading,
  };
}

/**
 * Adentrar e sair de uma loja.
 *
 * Limpa o cache inteiro: praticamente toda consulta do app muda de dono quando
 * o contexto troca, e uma lista antiga na tela seria estoque da loja errada.
 */
export function useEnterStore() {
  const queryClient = useQueryClient();

  const reset = () => queryClient.invalidateQueries();

  const enter = useMutation({
    mutationFn: async (storeOwnerId: string) => {
      const { error } = await supabase.rpc("enter_store", { _store_owner_id: storeOwnerId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Você está operando dentro desta loja");
      reset();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao adentrar"),
  });

  const leave = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("leave_store");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("De volta à sua própria conta");
      reset();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao sair"),
  });

  return { enter, leave };
}
