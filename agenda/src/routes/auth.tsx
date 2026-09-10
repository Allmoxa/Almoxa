import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { LogoBracket } from "@/components/logo-bracket";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { PasswordInput } from "@/components/ui/password-input";
import { supabase } from "@/integrations/supabase/client";
import { emailSchema } from "@/lib/validation";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Almoxá Agenda" },
      {
        name: "description",
        content: "Acesse sua conta para ver os horários marcados e gerenciar sua agenda.",
      },
    ],
  }),
  component: PaginaDeEntrada,
});

const schema = z.object({
  email: emailSchema,
  senha: z.string().min(1, { message: "Informe a senha" }),
});

type FormValues = z.infer<typeof schema>;

function PaginaDeEntrada() {
  const navigate = useNavigate();
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [ocupado, setOcupado] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/agenda" });
    });
  }, [navigate]);

  const enviar = async ({ email, senha }: FormValues) => {
    setOcupado(true);
    try {
      if (modo === "criar") {
        const { error } = await supabase.auth.signUp({ email, password: senha });
        if (error) throw error;
        // O gatilho handle_new_provider já criou o cadastro do prestador no
        // banco; a tela só precisa levar a pessoa pra agenda.
        toast.success("Conta criada. Bem-vindo!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      }
      navigate({ to: "/agenda" });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "";
      // A mensagem do Supabase vem em inglês; traduzir as duas mais comuns
      // evita "Invalid login credentials" na cara de quem só errou a senha.
      if (/invalid login credentials/i.test(mensagem)) {
        toast.error("E-mail ou senha incorretos.");
      } else if (/already registered|already exists/i.test(mensagem)) {
        toast.error("Esse e-mail já tem conta. Tente entrar.");
      } else if (/password/i.test(mensagem) && /6/.test(mensagem)) {
        toast.error("A senha precisa de pelo menos 6 caracteres.");
      } else {
        toast.error(mensagem || "Não foi possível continuar. Tente de novo.");
      }
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background paper-texture-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mx-auto block w-fit font-logo text-xl font-semibold">
          <LogoBracket>Almoxá Agenda</LogoBracket>
        </div>

        <p className="label-caps mt-10 text-center">
          {modo === "entrar" ? "Área do prestador" : "Criar conta"}
        </p>
        <h1 className="mt-3 text-center text-3xl">
          {modo === "entrar" ? "Entre na sua agenda" : "Comece a receber agendamentos"}
        </h1>

        <form onSubmit={handleSubmit(enviar)} className="mt-8 space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="label-caps">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!!errors.email}
              {...register("email")}
              className="mt-2 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring aria-[invalid=true]:border-destructive"
            />
            {errors.email ? (
              <p role="alert" className="mt-1.5 text-xs text-destructive">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="senha" className="label-caps">
              Senha
            </label>
            {/* O className do PasswordInput vai direto no <input> interno, e o
                botão do olho é posicionado contra o wrapper dele — por isso a
                margem fica neste div, e não na prop. */}
            <div className="mt-2">
              <PasswordInput
                id="senha"
                autoComplete={modo === "criar" ? "new-password" : "current-password"}
                aria-invalid={!!errors.senha}
                {...register("senha")}
                className="w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring aria-[invalid=true]:border-destructive"
              />
            </div>
            {errors.senha ? (
              <p role="alert" className="mt-1.5 text-xs text-destructive">
                {errors.senha.message}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={ocupado}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {ocupado ? <BoxSpinner size={16} /> : null}
            {ocupado ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {modo === "entrar" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
          <button
            type="button"
            onClick={() => setModo(modo === "entrar" ? "criar" : "entrar")}
            className="underline underline-offset-4 transition-colors hover:text-foreground"
          >
            {modo === "entrar" ? "Criar agora" : "Entrar"}
          </button>
        </p>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          <Link to="/" className="underline underline-offset-4 hover:text-foreground">
            Voltar ao início
          </Link>
        </p>
      </div>
    </div>
  );
}
