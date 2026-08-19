import { Link, useRouter } from "@tanstack/react-router";
import { Check, Menu, Moon, ShieldCheck, Settings, Sun } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { AdminPanel } from "@/components/AdminPanel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useStoreContext, useEnterStore } from "@/hooks/use-store-context";
import { useTheme } from "@/hooks/use-theme";
import { useUserRole } from "@/hooks/use-user-role";
import { supabase } from "@/integrations/supabase/client";
import { LogoBracket } from "@/components/logo-bracket";

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
  const { isOnisciente, isComissionado } = useUserRole();
  const { entered, storeEmail } = useStoreContext();
  const { leave } = useEnterStore();
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [adminPanelReturnsTo, setAdminPanelReturnsTo] = useState<"gear" | "menu">("gear");
  const gearButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);

  const items = isComissionado ? [...comissionadoNav] : [...nav];

  const openAdminPanel = (from: "gear" | "menu") => {
    setAdminPanelReturnsTo(from);
    // Adiar o open evita a disputa de foco com o fechamento do próprio menu/sheet que disparou.
    setTimeout(() => setAdminPanelOpen(true), 0);
  };

  const signOut = async () => {
    setMobileOpen(false);
    await supabase.auth.signOut();
    router.navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-4 sm:px-6">
          <Link to="/estoque" className="font-logo text-2xl font-semibold leading-none">
            <LogoBracket>Almoxá</LogoBracket>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  ref={gearButtonRef}
                  aria-label="Opções"
                  className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-secondary hover:text-foreground"
                >
                  <Settings className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {isOnisciente ? (
                  <>
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        openAdminPanel("gear");
                      }}
                    >
                      <ShieldCheck className="size-4" />
                      Painel administrativo
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
                  ref={mobileMenuButtonRef}
                  aria-label="Abrir menu"
                  className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-muted hover:text-foreground"
                >
                  <Menu className="size-5" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="flex w-[85vw] max-w-xs flex-col gap-0 sm:max-w-sm"
              >
                <SheetTitle className="font-logo text-xl font-semibold">
                  <LogoBracket>Almoxá</LogoBracket>
                </SheetTitle>

                {isOnisciente ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      openAdminPanel("menu");
                    }}
                    className="mt-6 flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ShieldCheck className="size-4" />
                    Painel administrativo
                  </button>
                ) : null}

                <nav className={`flex flex-col gap-1 ${isOnisciente ? "mt-1" : "mt-6"}`}>
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

      {entered ? (
        <div className="border-b border-primary/30 bg-primary/10">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <p className="text-sm">
              Você está operando dentro de{" "}
              <span className="font-medium">{storeEmail ?? "outra conta"}</span>. Tudo que lançar
              entra no estoque dela — com o seu nome no histórico.
            </p>
            <button
              type="button"
              onClick={() => leave.mutate()}
              disabled={leave.isPending}
              className="rounded-md border border-border-strong bg-card px-3 py-1 text-xs whitespace-nowrap transition-colors hover:bg-secondary disabled:opacity-50"
            >
              Sair da loja
            </button>
          </div>
        </div>
      ) : null}

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

      {isOnisciente ? (
        <AdminPanel
          open={adminPanelOpen}
          onOpenChange={setAdminPanelOpen}
          returnFocusRef={adminPanelReturnsTo === "gear" ? gearButtonRef : mobileMenuButtonRef}
        />
      ) : null}
    </div>
  );
}
