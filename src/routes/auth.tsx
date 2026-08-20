import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { PasswordInput } from "@/components/ui/password-input";
import { CreateAccountDialog } from "@/components/create-account-dialog";
import { LoginStickers } from "@/components/login-stickers";
import { LogoBracket } from "@/components/logo-bracket";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Almoxá controle de estoque" },
      {
        name: "description",
        content:
          "Acesse sua conta Almoxá para registrar entradas e saídas de produtos por foto ou documento.",
      },
      { property: "og:title", content: "Entrar — Almoxá controle de estoque" },
      {
        property: "og:description",
        content:
          "Acesse sua conta Almoxá para registrar entradas e saídas de produtos por foto ou documento.",
      },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email({ message: "E-mail inválido" }).max(255),
  // Só "não vazio" -- login não é hora de policiar força de senha (isso é
  // coisa de cadastro/troca de senha), e apertar o mínimo aqui bloquearia
  // login de conta antiga que nasceu com senha mais curta.
  password: z.string().min(1, { message: "Informe a senha" }).max(72),
});

// Freio progressivo contra tentativa repetida direto do navegador: cada
// login que falha soma 1, e a partir da 5ª tentativa a próxima só libera
// depois de um intervalo que dobra (5s, 10s, 20s...). Não substitui o rate
// limit do próprio projeto Supabase (Authentication > Rate Limits) -- é só
// mais uma barreira, do lado de cá, contra um script batendo local sem parar.
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_BASE_MS = 5000;

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/estoque" });
    });
  }, [navigate]);

  // Só existe um ticker enquanto há um bloqueio ativo -- destrava sozinho e
  // atualiza a contagem regressiva sem manter um intervalo rodando à toa.
  useEffect(() => {
    if (lockedUntil == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [lockedUntil]);

  const lockedSecondsLeft =
    lockedUntil != null && now < lockedUntil ? Math.ceil((lockedUntil - now) / 1000) : 0;
  const isLocked = lockedSecondsLeft > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLocked) {
      toast.error(`Muitas tentativas. Espera ${lockedSecondsLeft}s e tenta de novo.`);
      return;
    }
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      if (error) throw error;
      setFailedAttempts(0);
      setLockedUntil(null);
      navigate({ to: "/estoque" });
    } catch (error) {
      const next = failedAttempts + 1;
      setFailedAttempts(next);
      if (next >= LOCKOUT_THRESHOLD) {
        const backoff = LOCKOUT_BASE_MS * 2 ** (next - LOCKOUT_THRESHOLD);
        setLockedUntil(Date.now() + backoff);
      }
      toast.error(error instanceof Error ? error.message : "Não foi possível continuar");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/estoque` },
    });
    if (error) {
      setBusy(false);
      toast.error("Não foi possível entrar com o Google");
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-background">
      <LoginStickers />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl items-center px-6 py-6">
        <Link to="/" className="font-logo text-2xl font-semibold">
          <LogoBracket>Almoxá</LogoBracket>
        </Link>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm">
          <p className="label-caps">Acesso</p>
          <h1 className="mt-3 text-4xl">Entre no seu estoque</h1>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="email" className="label-caps">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring"
              />
            </div>
            <div>
              <label htmlFor="password" className="label-caps">
                Senha
              </label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring"
              />
            </div>
            <button
              type="submit"
              disabled={busy || isLocked}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <BoxSpinner size={16} /> : null}
              {isLocked ? `Aguarde ${lockedSecondsLeft}s` : busy ? "Entrando…" : "Entrar"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="label-caps">ou</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={google}
            disabled={busy}
            className="w-full rounded-md border border-border-strong bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50"
          >
            Continuar com Google
          </button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Ainda não tem conta?{" "}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Criar conta
            </button>
          </p>
        </div>
      </div>

      <CreateAccountDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
