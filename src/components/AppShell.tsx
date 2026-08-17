import { Link, useRouter } from "@tanstack/react-router";
import { Check, Menu, Moon, Settings, Sun } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useTheme } from "@/hooks/use-theme";
import { useUserRole, roleLabel } from "@/hooks/use-user-role";
import { supabase } from "@/integrations/supabase/client";

// Ordem do ciclo da barraca: ver o que tem, planejar a compra, dar entrada,
// vender, conferir.
const nav = [
  { to: "/estoque", label: "Estoque" },
  { to: "/comprar", label: "Comprar" },
  { to: "/receber", label: "Receber" },
  { to: "/vender", label: "Vender" },
  { to: "/movimentacoes", label: "Movimentações" },
  { to: "/equipe", label: "Equipe" },
  { to: "/dashboard", label: "Dashboard" },
] as const;

// O comissionado vê o estoque da loja e vende. Comprar, receber, o histórico e
// o dashboard contam custo e lucro, que não são assunto dele.
const comissionadoNav = [
  { to: "/estoque", label: "Estoque" },
  { to: "/vender", label: "Vender" },
] as const;

const oniscienteNav = { to: "/admin", label: "Onisciente" } as const;

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
  const { role, isOnisciente, isComissionado } = useUserRole();
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = isComissionado
    ? [...comissionadoNav]
    : isOnisciente
      ? [...nav, oniscienteNav]
      : [...nav];

  const signOut = async () => {
    setMobileOpen(false);
    await supabase.auth.signOut();
    router.navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-4 sm:px-6">
          <Link to="/estoque" className="font-display text-xl leading-none">
            Almoxá
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-4 md:flex">
            {role ? (
              <span
                className={`label-caps rounded-full px-2.5 py-1 ${
                  isOnisciente
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {roleLabel[role]}
              </span>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Opções"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Settings className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Tema</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setTheme("light")} className="justify-between">
                  <span className="flex items-center gap-2">
                    <Sun className="size-4" />
                    Claro
                  </span>
                  {theme === "light" ? <Check className="size-4" /> : null}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")} className="justify-between">
                  <span className="flex items-center gap-2">
                    <Moon className="size-4" />
                    Escuro
                  </span>
                  {theme === "dark" ? <Check className="size-4" /> : null}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>Sair</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="ml-auto flex items-center gap-1 md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  aria-label="Abrir menu"
                  className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Menu className="size-5" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="flex w-[85vw] max-w-xs flex-col gap-0 sm:max-w-sm"
              >
                <SheetTitle className="font-display text-lg">Almoxá</SheetTitle>

                {role ? (
                  <span
                    className={`label-caps mt-3 w-fit rounded-full px-2.5 py-1 ${
                      isOnisciente
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {roleLabel[role]}
                  </span>
                ) : null}

                <nav className="mt-6 flex flex-col gap-1">
                  {items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className="rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground"
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>

                <div className="rule-top mt-6 pt-6">
                  <p className="label-caps px-3">Tema</p>
                  <div className="mt-2 flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => setTheme("light")}
                      className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <span className="flex items-center gap-2">
                        <Sun className="size-4" />
                        Claro
                      </span>
                      {theme === "light" ? <Check className="size-4" /> : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme("dark")}
                      className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <span className="flex items-center gap-2">
                        <Moon className="size-4" />
                        Escuro
                      </span>
                      {theme === "dark" ? <Check className="size-4" /> : null}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={signOut}
                  className="rule-top mt-6 pt-6 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Sair
                </button>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl">{title}</h1>
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
