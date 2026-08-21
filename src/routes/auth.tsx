import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { PasswordInput } from "@/components/ui/password-input";
import { CreateAccountDialog } from "@/components/create-account-dialog";
import { ForgotPasswordDialog } from "@/components/forgot-password-dialog";
import { LoginStickers } from "@/components/login-stickers";
import { LogoBracket } from "@/components/logo-bracket";
import { supabase } from "@/integrations/supabase/client";
import { computeLockoutUntil, emailSchema, loginPasswordSchema } from "@/lib/auth-validation";

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
  email: emailSchema,
  password: loginPasswordSchema,
});

type FormValues = z.infer<typeof schema>;

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

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

  const submit = handleSubmit(async (data) => {
    if (isLocked) {
      toast.error(`Muitas tentativas. Espera ${lockedSecondsLeft}s e tenta de novo.`);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword(data);
      if (error) throw error;
      setFailedAttempts(0);
      setLockedUntil(null);
      navigate({ to: "/estoque" });
    } catch (error) {
      const next = failedAttempts + 1;
      setFailedAttempts(next);
      setLockedUntil(computeLockoutUntil(next, Date.now()));
      toast.error(error instanceof Error ? error.message : "Não foi possível continuar");
    } finally {
      setBusy(false);
    }
  });

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

          <form onSubmit={submit} noValidate className="mt-8 space-y-4">
            <div>
              <label htmlFor="email" className="label-caps">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
                className="mt-2 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring"
                {...register("email")}
              />
              {errors.email ? (
                <p id="email-error" role="alert" className="mt-1.5 text-xs text-destructive">
                  {errors.email.message}
                </p>
              ) : null}
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="password" className="label-caps">
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => setRecovering(true)}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "password-error" : undefined}
                className="mt-2 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring"
                {...register("password")}
              />
              {errors.password ? (
                <p id="password-error" role="alert" className="mt-1.5 text-xs text-destructive">
                  {errors.password.message}
                </p>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={busy || isSubmitting || isLocked}
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
      <ForgotPasswordDialog open={recovering} onOpenChange={setRecovering} />
    </div>
  );
}
