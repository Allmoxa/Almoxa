import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { LogoBracket } from "@/components/logo-bracket";
import { checkSiteGate } from "@/lib/site-gate.functions";

const STORAGE_KEY = "almoxa-site-gate";

/**
 * Portão temporário na frente da home pública -- some assim que o cadastro
 * de verdade abrir. "unlocked" começa null (nem mostra o portão nem a home)
 * pra não piscar conteúdo antes de checar o localStorage; só depois do
 * useEffect é que decide qual dos dois renderizar.
 */
export function SiteGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const check = useServerFn(checkSiteGate);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUnlocked(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { ok } = await check({ data: { username, password } });
      if (!ok) {
        toast.error("Usuário ou senha incorretos");
        return;
      }
      window.localStorage.setItem(STORAGE_KEY, "1");
      setUnlocked(true);
    } catch {
      toast.error("Não foi possível verificar o acesso");
    } finally {
      setBusy(false);
    }
  };

  if (unlocked === null) return null;
  if (unlocked) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="mx-auto block w-fit font-logo text-2xl font-semibold">
          <LogoBracket>Almoxá</LogoBracket>
        </div>

        <p className="label-caps mt-8 text-center">Em preparação</p>
        <h1 className="mt-3 text-center text-3xl">Ainda não é pra qualquer um</h1>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          O Almoxá está fechado pro público por enquanto. Se você tem o acesso, entra aqui.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="gate-user" className="label-caps">
              Usuário
            </label>
            <input
              id="gate-user"
              type="text"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-2 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring"
            />
          </div>
          <div>
            <label htmlFor="gate-password" className="label-caps">
              Senha
            </label>
            <input
              id="gate-password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <BoxSpinner size={16} /> : null}
            {busy ? "Verificando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
