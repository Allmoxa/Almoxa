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
import { emailSchema, newPasswordSchema } from "@/lib/auth-validation";

export const Route = createFileRoute("/criar-conta")({
  head: () => ({
    meta: [
      { title: "Criar conta — Almoxá" },
      {
        name: "description",
        content: "Crie sua conta Almoxá e comece a controlar o estoque por foto ou documento.",
      },
    ],
  }),
  component: CreateAccountPage,
});

const BUSINESS_TYPES = [
  { key: "varejo", label: "Varejo", hint: "Revende de tudo um pouco." },
  { key: "comida", label: "Comida", hint: "Bolo, salgado — tudo com receita." },
] as const;

type BusinessType = (typeof BUSINESS_TYPES)[number]["key"];

const schema = z
  .object({
    email: emailSchema,
    password: newPasswordSchema,
    confirm: z.string(),
    businessType: z.enum(["varejo", "comida"], {
      invalid_type_error: "Escolha o tipo do seu negócio",
    }),
    // Campo isca: só bot preenche (fica fora da tela, sem label, sem
    // autocomplete que bata com nenhuma categoria conhecida). Sem restrição
    // de tamanho aqui de propósito -- se travasse no schema, o envio
    // devolveria erro de validação visível, o que já entrega pro bot que ele
    // foi barrado. O corte silencioso acontece depois, no submit.
    hpField: z.string().optional(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "As senhas não coincidem",
    path: ["confirm"],
  });

type FormValues = z.infer<typeof schema>;

const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring";

function CreateAccountPage() {
  const navigate = useNavigate();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const businessType = watch("businessType") as BusinessType | undefined;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/estoque" });
    });
  }, [navigate]);

  const submit = handleSubmit(async (data) => {
    // Bot preencheu o campo isca: finge sucesso sem chamar o Supabase, pra
    // não dar sinal nenhum de que foi barrado.
    if (data.hpField) {
      setSentTo(data.email);
      return;
    }

    try {
      // business_type vai no metadata do Supabase (auth.users.raw_user_meta_data)
      // -- é só uma preferência de onboarding por enquanto, não controla
      // permissão nenhuma, então não precisa de coluna/migration própria.
      const { data: result, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: { data: { business_type: data.businessType } },
      });
      if (error) throw error;

      // Com confirmação de e-mail ligada no projeto, signUp não devolve sessão
      // -- a conta existe, mas só entra depois de clicar no link recebido.
      if (result.session) {
        navigate({ to: "/estoque" });
      } else {
        setSentTo(data.email);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a conta");
    }
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
          {sentTo ? (
            <>
              <p className="label-caps">Quase lá</p>
              <h1 className="mt-3 text-3xl">Confira seu e-mail</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Mandamos um link de confirmação para <span className="font-medium">{sentTo}</span>.
                Abra o e-mail pra ativar a conta
                {businessType
                  ? ` de ${BUSINESS_TYPES.find((t) => t.key === businessType)?.label.toLowerCase()}`
                  : ""}
                .
              </p>
              <Link
                to="/auth"
                className="mt-6 inline-flex rounded-md border border-border-strong px-4 py-2.5 text-sm transition-colors hover:bg-secondary"
              >
                Voltar para entrar
              </Link>
            </>
          ) : (
            <>
              <p className="label-caps">Cadastro</p>
              <h1 className="mt-3 text-4xl">Criar conta</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Sua conta nasce dona do próprio estoque.
              </p>

              <form onSubmit={submit} noValidate className="mt-8 space-y-4">
                {/* Isca anti-bot: invisível e fora da ordem de tab para quem usa
                    teclado/leitor de tela; sem name/autocomplete reconhecível, então
                    preenchimento automático do navegador nunca cai aqui. */}
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden"
                  {...register("hpField")}
                />
                <div>
                  <p className="label-caps" id="business-type-label">
                    Tipo do seu negócio
                  </p>
                  <div
                    className="mt-2 grid grid-cols-2 gap-2"
                    role="group"
                    aria-labelledby="business-type-label"
                  >
                    {BUSINESS_TYPES.map((type) => (
                      <button
                        key={type.key}
                        type="button"
                        onClick={() => setValue("businessType", type.key, { shouldValidate: true })}
                        aria-pressed={businessType === type.key}
                        className={`rounded-md border px-2.5 py-2.5 text-left transition-colors ${
                          businessType === type.key
                            ? "border-primary bg-primary/10"
                            : "border-input bg-card hover:bg-secondary"
                        }`}
                      >
                        <span className="block text-xs font-medium">{type.label}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                          {type.hint}
                        </span>
                      </button>
                    ))}
                  </div>
                  {errors.businessType ? (
                    <p role="alert" className="mt-1.5 text-xs text-destructive">
                      {errors.businessType.message}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor="create-email" className="label-caps">
                    E-mail
                  </label>
                  <input
                    id="create-email"
                    type="email"
                    autoComplete="email"
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "create-email-error" : undefined}
                    className={`mt-2 ${inputClass}`}
                    {...register("email")}
                  />
                  {errors.email ? (
                    <p
                      id="create-email-error"
                      role="alert"
                      className="mt-1.5 text-xs text-destructive"
                    >
                      {errors.email.message}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor="create-password" className="label-caps">
                    Senha
                  </label>
                  <PasswordInput
                    id="create-password"
                    autoComplete="new-password"
                    aria-invalid={!!errors.password}
                    aria-describedby={
                      errors.password ? "create-password-error" : "create-password-hint"
                    }
                    className={`mt-2 ${inputClass}`}
                    {...register("password")}
                  />
                  {errors.password ? (
                    <p
                      id="create-password-error"
                      role="alert"
                      className="mt-1.5 text-xs text-destructive"
                    >
                      {errors.password.message}
                    </p>
                  ) : (
                    <p id="create-password-hint" className="mt-1.5 text-xs text-muted-foreground">
                      Pelo menos 12 caracteres. Sem exigência de símbolo ou maiúscula.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="create-confirm" className="label-caps">
                    Confirmar senha
                  </label>
                  <PasswordInput
                    id="create-confirm"
                    autoComplete="new-password"
                    aria-invalid={!!errors.confirm}
                    aria-describedby={errors.confirm ? "create-confirm-error" : undefined}
                    className={`mt-2 ${inputClass}`}
                    {...register("confirm")}
                  />
                  {errors.confirm ? (
                    <p
                      id="create-confirm-error"
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
                  {isSubmitting ? "Criando…" : "Criar conta"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Já tem conta?{" "}
                <Link
                  to="/auth"
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  Entrar
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
