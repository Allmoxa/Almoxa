import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { LoginStickers } from "@/components/login-stickers";
import { LogoBracket } from "@/components/logo-bracket";
import { PasswordInput } from "@/components/ui/password-input";
import { supabase } from "@/integrations/supabase/client";
import { newPasswordSchema } from "@/lib/auth-validation";

export const Route = createFileRoute("/redefinir-senha")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Redefinir senha — Almoxá" }, { name: "robots", content: "noindex" }],
  }),
  component: ResetPasswordPage,
});

const schema = z
  .object({
    password: newPasswordSchema,
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "As senhas não coincidem",
    path: ["confirm"],
  });

type FormValues = z.infer<typeof schema>;

const inputClass =
  "mt-2 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring";

/**
 * Página onde o link de "esqueci minha senha" cai. O token de recuperação
 * (aleatório, de uso único, com expiração curta) mora inteiramente no
 * Supabase Auth -- o SDK já troca ele por uma sessão temporária ao carregar
 * a URL (detectSessionInUrl, ligado por padrão), e este componente só
 * escuta o evento PASSWORD_RECOVERY pra saber se isso aconteceu de verdade.
 */
function ResetPasswordPage() {
  const navigate = useNavigate();
  // null = ainda checando; true = link válido, sessão de recuperação ativa;
  // false = sem sessão nenhuma (link expirado, já usado, ou acesso direto).
  const [ready, setReady] = useState<boolean | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
      else if (event === "SIGNED_IN" && session) setReady((current) => current ?? true);
    });

    // Cobre o caso em que o evento já disparou antes deste efeito assinar --
    // se já existe sessão quando checamos, o link era válido.
    supabase.auth.getSession().then(({ data }) => {
      setReady((current) => current ?? Boolean(data.session));
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = handleSubmit(async ({ password }) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message || "Não foi possível redefinir a senha");
      return;
    }
    // Decisão deliberada: a redefinição não deixa o usuário logado. A sessão
    // de recuperação é encerrada e ele confirma a senha nova entrando de
    // novo, do zero -- fecha também qualquer outra sessão de recuperação
    // aberta por engano na mesma conta.
    await supabase.auth.signOut();
    setDone(true);
    toast.success("Senha redefinida. Entra de novo com a senha nova.");
    setTimeout(() => navigate({ to: "/auth" }), 1500);
  });

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
          {ready === null ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <BoxSpinner size={32} />
              <p className="text-sm text-muted-foreground">Verificando o link…</p>
            </div>
          ) : ready === false ? (
            <>
              <p className="label-caps">Link inválido</p>
              <h1 className="mt-3 text-3xl">Esse link não é mais válido</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Ele pode ter expirado ou já ter sido usado. Pede um novo na tela de entrar.
              </p>
              <Link
                to="/auth"
                className="mt-6 inline-flex rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Voltar para entrar
              </Link>
            </>
          ) : done ? (
            <>
              <p className="label-caps">Pronto</p>
              <h1 className="mt-3 text-3xl">Senha redefinida</h1>
              <p className="mt-3 text-sm text-muted-foreground">Te levamos pra tela de entrar…</p>
            </>
          ) : (
            <>
              <p className="label-caps">Nova senha</p>
              <h1 className="mt-3 text-3xl">Escolhe uma senha nova</h1>

              <form onSubmit={submit} noValidate className="mt-8 space-y-4">
                <div>
                  <label htmlFor="new-password" className="label-caps">
                    Nova senha
                  </label>
                  <PasswordInput
                    id="new-password"
                    autoComplete="new-password"
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? "new-password-error" : "new-password-hint"}
                    className={inputClass}
                    {...register("password")}
                  />
                  {errors.password ? (
                    <p
                      id="new-password-error"
                      role="alert"
                      className="mt-1.5 text-xs text-destructive"
                    >
                      {errors.password.message}
                    </p>
                  ) : (
                    <p id="new-password-hint" className="mt-1.5 text-xs text-muted-foreground">
                      Pelo menos 12 caracteres.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="confirm-password" className="label-caps">
                    Confirmar senha
                  </label>
                  <PasswordInput
                    id="confirm-password"
                    autoComplete="new-password"
                    aria-invalid={!!errors.confirm}
                    aria-describedby={errors.confirm ? "confirm-password-error" : undefined}
                    className={inputClass}
                    {...register("confirm")}
                  />
                  {errors.confirm ? (
                    <p
                      id="confirm-password-error"
                      role="alert"
                      className="mt-1.5 text-xs text-destructive"
                    >
                      {errors.confirm.message}
                    </p>
                  ) : null}
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {isSubmitting ? <BoxSpinner size={16} /> : null}
                  {isSubmitting ? "Salvando…" : "Salvar nova senha"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
