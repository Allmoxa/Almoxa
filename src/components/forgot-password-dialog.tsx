import { zodResolver } from "@hookform/resolvers/zod";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { supabase } from "@/integrations/supabase/client";
import { emailSchema } from "@/lib/auth-validation";

const schema = z.object({ email: emailSchema });
type FormValues = z.infer<typeof schema>;

const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring";

/**
 * "Esqueci minha senha": manda o e-mail de redefinição pelo próprio Supabase
 * Auth (token de uso único com expiração, gerado e validado no lado deles --
 * não inventamos nada de criptografia aqui). A tela do link cai em
 * /redefinir-senha.
 */
export function ForgotPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const titleId = useId();
  const descId = useId();
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const submit = handleSubmit(async ({ email }) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    // Supabase não diferencia e-mail com conta de e-mail sem conta aqui --
    // por design, `error` só aparece por falha de verdade (rede, limite de
    // taxa), nunca por "esse e-mail não existe". Por isso dá pra mostrar erro
    // operacional sem abrir brecha de enumeração de contas.
    if (error) {
      toast.error("Não foi possível enviar agora. Tenta de novo em instantes.");
      return;
    }
    setSent(true);
  });

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      reset();
      setSent(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={close}>
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
                        Recuperar senha
                      </h2>
                      <p id={descId} className="mt-1 text-sm text-muted-foreground">
                        {sent
                          ? "Confira seu e-mail."
                          : "Manda um link pra você escolher uma senha nova."}
                      </p>
                    </div>
                    <DialogPrimitive.Close
                      aria-label="Fechar"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <X className="size-5" />
                    </DialogPrimitive.Close>
                  </div>

                  {sent ? (
                    <div className="mt-6">
                      <p className="text-sm">
                        Se esse e-mail tiver uma conta aqui, mandamos um link de redefinição pra
                        ele. Abre a caixa de entrada (e o spam, por garantia).
                      </p>
                      <button
                        type="button"
                        onClick={() => close(false)}
                        className="mt-6 w-full rounded-md border border-border-strong px-4 py-2.5 text-sm transition-colors hover:bg-secondary"
                      >
                        Fechar
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={submit} noValidate className="mt-6 space-y-4">
                      <div>
                        <label htmlFor="forgot-email" className="label-caps">
                          E-mail
                        </label>
                        <input
                          id="forgot-email"
                          type="email"
                          autoComplete="email"
                          aria-invalid={!!errors.email}
                          aria-describedby={errors.email ? "forgot-email-error" : undefined}
                          className={`mt-2 ${inputClass}`}
                          {...register("email")}
                        />
                        {errors.email ? (
                          <p
                            id="forgot-email-error"
                            role="alert"
                            className="mt-1.5 text-xs text-destructive"
                          >
                            {errors.email.message}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {isSubmitting ? <BoxSpinner size={16} /> : null}
                        {isSubmitting ? "Enviando…" : "Enviar link"}
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
