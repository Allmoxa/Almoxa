import { Link, useRouter } from "@tanstack/react-router";
import { ArrowUpRight, Check, Menu, Moon, Settings, Sun } from "lucide-react";
import { useState, type ReactNode } from "react";
import { LogoBracket } from "@/components/logo-bracket";
import { NavTabLabel } from "@/components/nav-tab-label";
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
import { supabase } from "@/integrations/supabase/client";

// Ordem do dia do prestador: ver o que vem, o que ele oferece, quando atende,
// e por onde o cliente chega.
const nav = [
  { to: "/agenda", label: "Agenda" },
  { to: "/servicos", label: "Serviços" },
  { to: "/disponibilidade", label: "Disponibilidade" },
  { to: "/link", label: "Seu link" },
] as const;

/**
 * Moldura das telas do prestador — mesma estrutura do AppShell do Almoxá,
 * pra quem usa os dois não precisar reaprender onde ficam as coisas.
 *
 * A navegação por abas some abaixo de md e vira gaveta lateral. No Almoxá
 * são sete abas; aqui são quatro, então elas cabem numa barra fixa inferior
 * no celular — que é onde o polegar alcança sem reposicionar o aparelho.
 */
export function AgendaShell({
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
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Vazio esconde o atalho: quem roda só a agenda não tem para onde voltar.
  const linkDoAlmoxa = import.meta.env["VITE_ALMOXA_APP_URL"] as string | undefined;

  const signOut = async () => {
    setMobileOpen(false);
    await supabase.auth.signOut();
    router.navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-4 sm:px-6">
          <Link to="/agenda" className="font-logo text-xl font-semibold leading-none">
            <LogoBracket>Almoxá Agenda</LogoBracket>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="nav-tab relative rounded-md px-[18px] py-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                activeProps={{ className: "is-active text-foreground font-medium" }}
              >
                {({ isActive }) => <NavTabLabel active={isActive}>{item.label}</NavTabLabel>}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-4 md:flex">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Opções"
                  className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-secondary hover:text-foreground"
                >
                  <Settings className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {linkDoAlmoxa ? (
                  <>
                    <DropdownMenuItem asChild>
                      <a href={linkDoAlmoxa} target="_blank" rel="noopener noreferrer">
                        <ArrowUpRight className="size-4" />
                        Ir para o Almoxá
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                <DropdownMenuLabel>Configurações da conta</DropdownMenuLabel>
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
                  className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-muted hover:text-foreground"
                >
                  <Menu className="size-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="flex w-[85vw] max-w-xs flex-col gap-0">
                <SheetTitle className="font-logo text-lg font-semibold">
                  <LogoBracket>Almoxá Agenda</LogoBracket>
                </SheetTitle>

                {linkDoAlmoxa ? (
                  <a
                    href={linkDoAlmoxa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 flex items-center gap-2 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ArrowUpRight className="size-4" />
                    Ir para o Almoxá
                  </a>
                ) : null}

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

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl">{title}</h1>
            {description ? (
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action}
        </div>
        <div className="mt-8 sm:mt-10">{children}</div>
      </main>

      {/* Barra inferior: quatro destinos cabem sem apertar, e no celular o
          polegar chega aqui sem trocar a pegada no aparelho. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-background/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Navegação principal"
      >
        {nav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] text-muted-foreground transition-colors data-[status=active]:font-medium data-[status=active]:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
