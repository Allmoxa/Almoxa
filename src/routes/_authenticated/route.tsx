import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  // Cobre o intervalo entre o login e a primeira tela autenticada renderizar,
  // enquanto a checagem de sessão do beforeLoad ainda está em andamento.
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
