import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
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

    // Esta é a única função de servidor sem autenticação, e cada chamada gasta
    // cota do Resend. Sem freio, um laço de shell derruba o canal de contato e
    // enche a caixa do dono, de graça. O honeypot acima só pega bot ingênuo.
    const forwarded = getRequest()?.headers.get("x-forwarded-for") ?? "";
    const ip = (forwarded.split(",")[0] ?? "").trim() || "desconhecido";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // O tipo de .rpc() sai de integrations/supabase/types.ts, que o CLI gera a
    // partir do banco: consume_contact_quota só aparece ali depois da migration
    // aplicada e dos tipos regerados. Até lá, a assinatura vai declarada aqui.
    const consumeQuota = supabaseAdmin.rpc as unknown as (
      fn: "consume_contact_quota",
      args: { _ip: string },
    ) => Promise<{ data: boolean | null; error: { message: string } | null }>;

    const { data: dentroDoTeto, error: quotaError } = await consumeQuota("consume_contact_quota", {
      _ip: ip,
    });
    // Falha do freio não vira porta aberta: sem resposta do banco, não envia.
    if (quotaError)
      throw new Error("Não foi possível enviar sua mensagem. Tente de novo em instantes.");
    if (!dentroDoTeto) {
      throw new Error("Você já enviou várias mensagens. Aguarde um pouco antes de tentar de novo.");
    }

    const apiKey = process.env["RESEND_API_KEY"];
    const to = process.env["CONTACT_EMAIL_TO"];
    if (!apiKey || !to) throw new Error("Formulário de contato indisponível no momento.");

    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const { error } = await resend.emails.send({
      from: "Almoxá <onboarding@resend.dev>",
      to: [to],
      replyTo: data.email,
      // Sem quebra de linha no nome: ele vai para um cabeçalho da mensagem,
      // e quebra de linha ali é o vetor clássico para pendurar um Bcc.
      subject: `Fale conosco — ${data.name.replace(/[\r\n]+/g, " ")}`,
      text: `De: ${data.name} <${data.email}>\n\n${data.message}`,
    });
    if (error) throw new Error("Não foi possível enviar sua mensagem. Tente de novo em instantes.");

    return { ok: true };
  });
