import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Camada logada do prestador.
 *
 * ssr: false porque a sessão do Supabase vive no localStorage — no servidor
 * não há como saber quem é, e renderizar "deslogado" pra depois trocar no
 * cliente produz um piscar de tela de login em quem já está logado.
 */
export const Route = createFileRoute("/_app")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  pendingComponent: () => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <BoxSpinner size={40} />
      <p className="text-sm text-muted-foreground">Carregando…</p>
    </div>
  ),
  pendingMs: 200,
  pendingMinMs: 400,
  component: () => <Outlet />,
});
