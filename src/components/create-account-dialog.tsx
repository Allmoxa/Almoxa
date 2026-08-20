import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { PasswordInput } from "@/components/ui/password-input";
import { supabase } from "@/integrations/supabase/client";

const schema = z
  .object({
    email: z.string().trim().email({ message: "E-mail inválido" }).max(255),
    // 8 e não 6: acompanha o mínimo que o próprio projeto Supabase exige (ver
    // Authentication > Settings) -- abaixo disso o signUp falha no servidor
    // mesmo passando na validação local. Sem exigir símbolo/maiúscula: NIST
    // 800-63B recomenda comprimento sobre complexidade forçada.
    password: z.string().min(8, { message: "A senha precisa de ao menos 8 caracteres" }).max(72),
    confirm: z.string(),
    // Campo isca: só bot preenche (fica fora da tela, sem label, sem
    // autocomplete que bata com nenhuma categoria conhecida). Humano de
    // verdade nunca manda valor aqui.
    hpField: z.string().max(0, { message: "Falha na validação" }).optional(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "As senhas não coincidem",
    path: ["confirm"],
  });

const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring";

const BUSINESS_TYPES = [
  { key: "varejo", label: "Varejo", hint: "Revende de tudo um pouco." },
  { key: "comida", label: "Comida", hint: "Bolo, salgado — tudo com receita." },
] as const;

type BusinessType = (typeof BUSINESS_TYPES)[number]["key"];

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

  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [hpField, setHpField] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const reset = () => {
    setBusinessType(null);
    setEmail("");
    setPassword("");
    setConfirm("");
    setHpField("");
    setSentTo(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!businessType) {
      toast.error("Escolha o tipo do seu negócio");
      return;
    }
    const parsed = schema.safeParse({ email, password, confirm, hpField });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }

    // Bot preencheu o campo isca: finge sucesso sem chamar o Supabase, pra não
    // dar sinal nenhum de que foi barrado.
    if (hpField) {
      setSentTo(parsed.data.email);
      return;
    }

    setBusy(true);
    try {
      // business_type vai no metadata do Supabase (auth.users.raw_user_meta_data)
      // -- é só uma preferência de onboarding por enquanto, não controla
      // permissão nenhuma, então não precisa de coluna/migration própria.
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: { data: { business_type: businessType } },
      });
      if (error) throw error;

      // Com confirmação de e-mail ligada no projeto, signUp não devolve sessão
      // -- a conta existe, mas só entra depois de clicar no link recebido.
      if (data.session) {
        onOpenChange(false);
        reset();
        navigate({ to: "/estoque" });
      } else {
        setSentTo(parsed.data.email);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a conta");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
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
                    <form onSubmit={submit} className="mt-6 space-y-4">
                      {/* Isca anti-bot: invisível e fora da ordem de tab para quem usa
                          teclado/leitor de tela; sem name/autocomplete reconhecível, então
                          preenchimento automático do navegador nunca cai aqui. */}
                      <input
                        type="text"
                        value={hpField}
                        onChange={(e) => setHpField(e.target.value)}
                        tabIndex={-1}
                        autoComplete="off"
                        aria-hidden="true"
                        className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden"
                      />
                      <div>
                        <p className="label-caps">Tipo do seu negócio</p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {BUSINESS_TYPES.map((type) => (
                            <button
                              key={type.key}
                              type="button"
                              onClick={() => setBusinessType(type.key)}
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
                      </div>
                      <div>
                        <label htmlFor="create-email" className="label-caps">
                          E-mail
                        </label>
                        <input
                          id="create-email"
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={`mt-2 ${inputClass}`}
                        />
                      </div>
                      <div>
                        <label htmlFor="create-password" className="label-caps">
                          Senha
                        </label>
                        <PasswordInput
                          id="create-password"
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={`mt-2 ${inputClass}`}
                        />
                      </div>
                      <div>
                        <label htmlFor="create-confirm" className="label-caps">
                          Confirmar senha
                        </label>
                        <PasswordInput
                          id="create-confirm"
                          autoComplete="new-password"
                          value={confirm}
                          onChange={(e) => setConfirm(e.target.value)}
                          className={`mt-2 ${inputClass}`}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={busy}
                        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {busy ? <BoxSpinner size={16} /> : null}
                        {busy ? "Criando…" : "Criar conta"}
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
