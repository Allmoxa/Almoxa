import { Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useUserRole, roleLabel } from "@/hooks/use-user-role";
import { supabase } from "@/integrations/supabase/client";

const nav = [
  { to: "/estoque", label: "Estoque" },
  { to: "/receber", label: "Receber" },
  { to: "/vender", label: "Vender" },
  { to: "/movimentacoes", label: "Movimentações" },
  { to: "/dashboard", label: "Dashboard" },
] as const;

const adminNav = { to: "/admin", label: "Admin" } as const;

export function AppShell({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const { role, isAdmin } = useUserRole();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
          <Link to="/estoque" className="font-display text-xl leading-none">
            Almoxá
          </Link>
          <nav className="flex items-center gap-1">
            {(isAdmin ? [...nav, adminNav] : nav).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            {role ? (
              <span
                className={`label-caps rounded-full px-2.5 py-1 ${
                  isAdmin
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {roleLabel[role]}
              </span>
            ) : null}
            <button
              onClick={signOut}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl">{title}</h1>
            {description ? (
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action}
        </div>
        <div className="mt-10">{children}</div>
      </main>
    </div>
  );
}
