import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useContactParallax } from "@/hooks/use-contact-parallax";
import { sendContactMessage } from "@/lib/contact.functions";

const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring";

export function ContactForm() {
  const send = useServerFn(sendContactMessage);
  const { sectionRef, textGroupRef, formRef } = useContactParallax();

  const mutation = useMutation({
    mutationFn: (values: { name: string; email: string; message: string; website: string }) =>
      send({ data: values }),
    onSuccess: () => toast.success("Mensagem enviada — respondemos por e-mail em breve."),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao enviar"),
  });

  return (
    <section id="contato" ref={sectionRef} className="border-b border-border py-24">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
        <div ref={textGroupRef} style={{ willChange: "transform" }}>
          <p className="label-caps">Fale conosco</p>
          <h2 className="mt-4 max-w-sm text-4xl leading-[1.05] sm:text-5xl">
            Dúvida, sugestão ou proposta?
          </h2>
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            Manda uma mensagem — a resposta vai direto pro seu e-mail.
          </p>
        </div>

        <form
          ref={formRef}
          className="paper-panel grid gap-4 p-6 sm:grid-cols-2"
          style={{ willChange: "transform" }}
          onSubmit={(event) => {
            event.preventDefault();
            // event.currentTarget vira null depois que o handler retorna, então
            // guarda a referência antes do .mutate() assíncrono chamar .reset().
            const formEl = event.currentTarget;
            const form = new FormData(formEl);
            const values = {
              name: String(form.get("name") ?? ""),
              email: String(form.get("email") ?? ""),
              message: String(form.get("message") ?? ""),
              website: String(form.get("website") ?? ""),
            };
            if (!values.name.trim()) {
              toast.error("Informe seu nome");
              return;
            }
            if (!values.email.trim()) {
              toast.error("Informe seu e-mail");
              return;
            }
            if (!values.message.trim()) {
              toast.error("Escreva uma mensagem");
              return;
            }
            mutation.mutate(values, {
              onSuccess: () => formEl.reset(),
            });
          }}
        >
          {/* Honeypot: invisível pra gente, tentador pra bot de formulário. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            className="absolute -left-[9999px]"
            aria-hidden="true"
          />

          <div>
            <label className="label-caps" htmlFor="contact-name">
              Nome
            </label>
            <input
              id="contact-name"
              name="name"
              className={`mt-2 ${inputClass}`}
              placeholder="Seu nome"
            />
          </div>
          <div>
            <label className="label-caps" htmlFor="contact-email">
              E-mail
            </label>
            <input
              id="contact-email"
              name="email"
              type="email"
              className={`mt-2 ${inputClass}`}
              placeholder="voce@email.com"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label-caps" htmlFor="contact-message">
              Mensagem
            </label>
            <textarea
              id="contact-message"
              name="message"
              rows={4}
              className={`mt-2 resize-none ${inputClass}`}
              placeholder="Como podemos ajudar?"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {mutation.isPending ? "Enviando…" : "Enviar mensagem"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
