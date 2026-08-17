import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  name: z.string().trim().min(1, { message: "Informe seu nome" }).max(120),
  email: z.string().trim().email({ message: "E-mail inválido" }).max(255),
  message: z.string().trim().min(1, { message: "Escreva uma mensagem" }).max(5000),
  // Honeypot: campo escondido no formulário que só um bot preencheria.
  // Preenchido, a gente finge sucesso e não gasta cota do Resend com ele.
  website: z.string().max(200).optional(),
});

export const sendContactMessage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    if (data.website) return { ok: true };

    const apiKey = process.env["RESEND_API_KEY"];
    const to = process.env["CONTACT_EMAIL_TO"];
    if (!apiKey || !to) throw new Error("Formulário de contato indisponível no momento.");

    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const { error } = await resend.emails.send({
      from: "Almoxá <onboarding@resend.dev>",
      to: [to],
      replyTo: data.email,
      subject: `Fale conosco — ${data.name}`,
      text: `De: ${data.name} <${data.email}>\n\n${data.message}`,
    });
    if (error) throw new Error("Não foi possível enviar sua mensagem. Tente de novo em instantes.");

    return { ok: true };
  });
