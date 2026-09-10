/**
 * Ações do prestador que precisam do servidor.
 *
 * A maior parte da tela dele fala direto com o Supabase pelo cliente do
 * navegador — a RLS já filtra por dono, e passar tudo por server function
 * seria uma camada a mais sem ganho. Aqui ficam só as duas coisas que a RLS
 * não resolve sozinha: mandar e-mail (precisa da chave do Resend) e girar o
 * token do calendário (coluna que authenticated não pode escrever).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { uidDoAgendamento } from "@/agenda/lib/booking.functions";

class ErroDeAgenda extends Error {}

function urlPublica(): string {
  return (process.env["AGENDA_PUBLIC_URL"] ?? "http://localhost:8081").replace(/\/+$/, "");
}

/**
 * Cancela pelo lado do prestador e avisa o cliente.
 *
 * A leitura confere o dono antes de qualquer escrita: o middleware garante
 * que existe alguém logado, não que o agendamento é dele. Sem este passo,
 * mandar um id qualquer cancelaria compromisso de outro prestador.
 */
export const cancelarPeloPrestador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: linha } = await supabaseAdmin
      .from("appointments")
      .select(
        `id, starts_at, ends_at, status, client_name, client_email, notes, manage_token,
         services ( name, duration_minutes, price_cents ),
         providers ( user_id, display_name, timezone, contact_email )`,
      )
      .eq("id", data.id)
      .maybeSingle();

    if (!linha) throw new ErroDeAgenda("Agendamento não encontrado.");

    const prestador = umDe(linha.providers);
    if (!prestador || prestador.user_id !== context.userId) {
      throw new ErroDeAgenda("Agendamento não encontrado.");
    }
    if (linha.status === "cancelado") return { ok: true };

    const { data: cancelado, error } = await supabaseAdmin
      .from("appointments")
      .update({
        status: "cancelado",
        cancelled_at: new Date().toISOString(),
        cancelled_by: "prestador",
      })
      .eq("id", linha.id)
      .neq("status", "cancelado")
      .select("id")
      .maybeSingle();

    if (error) throw new ErroDeAgenda("Não foi possível cancelar. Tente de novo.");
    if (!cancelado) return { ok: true };

    const servico = umDe(linha.services);
    if (!servico) return { ok: true };

    const { emailDeCancelamento, anexoDoEvento, enviarEmail } = await import("@/agenda/lib/email.server");

    const dadosDoEmail = {
      prestador: prestador.display_name,
      servico: servico.name,
      duracaoMinutos: servico.duration_minutes,
      precoCentavos: servico.price_cents,
      clienteNome: linha.client_name,
      clienteEmail: linha.client_email,
      inicio: new Date(linha.starts_at),
      timeZone: prestador.timezone,
      linkDeGestao: `${urlPublica()}/agendamento/${linha.manage_token}`,
      observacao: linha.notes,
    };

    const aviso = emailDeCancelamento(dadosDoEmail, "prestador");
    await enviarEmail({
      to: linha.client_email,
      ...aviso,
      replyTo: prestador.contact_email ?? undefined,
      attachments: [
        anexoDoEvento(dadosDoEmail, uidDoAgendamento(linha.id), new Date(linha.ends_at), true),
      ],
    });

    return { ok: true };
  });

/**
 * Gera um token novo pro feed de calendário.
 *
 * A URL da assinatura fica salva no aparelho e às vezes vai parar num
 * e-mail ou num print. Girar o token é a forma de cortar o acesso antigo —
 * quem tinha a URL velha para de receber, e o prestador assina de novo.
 */
export const girarTokenDoCalendario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ calendarToken: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("providers")
      .update({ calendar_token: crypto.randomUUID() })
      .eq("user_id", context.userId)
      .select("calendar_token")
      .single();

    if (error || !data) throw new ErroDeAgenda("Não foi possível gerar um link novo.");
    return { calendarToken: data.calendar_token };
  });

/** Endereço público da agenda, pro prestador copiar e mandar pro cliente. */
export const lerUrlPublica = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ base: string }> => ({ base: urlPublica() }),
);

function umDe<T>(valor: T | T[] | null): T | null {
  if (valor === null) return null;
  return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}
