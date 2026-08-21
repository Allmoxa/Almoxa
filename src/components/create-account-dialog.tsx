import { zodResolver } from "@hookform/resolvers/zod";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { PasswordInput } from "@/components/ui/password-input";
import { supabase } from "@/integrations/supabase/client";
import { emailSchema, newPasswordSchema } from "@/lib/auth-validation";

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

export function CreateAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const titleId = useId();
  const descId = useId();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const businessType = watch("businessType") as BusinessType | undefined;

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
        onOpenChange(false);
        reset();
        navigate({ to: "/estoque" });
      } else {
        setSentTo(data.email);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a conta");
    }
  });

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          reset();
          setSentTo(null);
        }
      }}
    >
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: shouldReduceMotion ? 0.12 : 0.25 }}
              />
            </DialogPrimitive.Overlay>

            <div className="fixed inset-0 z-[61] flex items-center justify-center overflow-y-auto px-6 py-10">
              <DialogPrimitive.Content
                asChild
                forceMount
                aria-labelledby={titleId}
                aria-describedby={descId}
              >
                <motion.div
                  className="paper-panel w-full max-w-sm p-6"
                  style={{ boxShadow: "var(--shadow-lift)" }}
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 20 }}
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0.15 }
                      : { duration: 0.42, ease: [0.22, 1, 0.36, 1] }
                  }
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 id={titleId} className="text-2xl">
                        Criar conta
                      </h2>
                      <p id={descId} className="mt-1 text-sm text-muted-foreground">
                        Sua conta nasce dona do próprio estoque.
                      </p>
                    </div>
                    <DialogPrimitive.Close
                      aria-label="Fechar"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <X className="size-5" />
                    </DialogPrimitive.Close>
                  </div>

                  {sentTo ? (
                    <div className="mt-6">
                      <p className="text-sm">
                        Mandamos um link de confirmação para{" "}
                        <span className="font-medium">{sentTo}</span>. Abra o e-mail pra ativar a
                        conta{" "}
                        {businessType
                          ? `de ${BUSINESS_TYPES.find((t) => t.key === businessType)?.label.toLowerCase()}`
                          : ""}
                        .
                      </p>
                      <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="mt-6 w-full rounded-md border border-border-strong px-4 py-2.5 text-sm transition-colors hover:bg-secondary"
                      >
                        Fechar
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={submit} noValidate className="mt-6 space-y-4">
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
                              onClick={() =>
                                setValue("businessType", type.key, { shouldValidate: true })
                              }
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
                          <p
                            id="create-password-hint"
                            className="mt-1.5 text-xs text-muted-foreground"
                          >
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
                  )}
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
