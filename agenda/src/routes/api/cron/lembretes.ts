import { createFileRoute } from "@tanstack/react-router";
import { deveEnviarAgora, tetoDaConsultaMs } from "@/lib/lembretes";

/**
 * Disparo dos lembretes por e-mail.
 *
 * Chamada pelo Vercel Cron (ver `crons` no vercel.json). Cada prestador
 * escolhe a antecedência (`reminder_hours`), então a rota carrega a janela
 * maior possível de uma vez e filtra por prestador aqui em cima — uma consulta
 * em vez de uma por conta.
 *
 * A rota não sabe de quanto em quanto tempo é chamada, e precisa saber: é isso
 * que decide se dá pra deixar um lembrete "pra próxima passada". Daí a
 * constante abaixo, que tem de acompanhar o vercel.json.
 *
 * `reminder_sent_at` é o que garante envio único. Ele é gravado por
 * agendamento, logo depois do envio daquele: se a função morrer no meio da
 * lista, quem já recebeu não recebe de novo na próxima passada.
 */
/**
 * De quanto em quanto tempo o cron chama esta rota, em minutos.
 *
 * O plano Hobby da Vercel só aceita cron diário — uma expressão de 15 em 15
 * minutos é recusada no deploy —, por isso 1440. Num plano que permita
 * mais, ou com o pg_cron do Supabase chamando a rota (ver README), baixe este
 * número junto com o `schedule` do vercel.json: os dois descrevem a mesma
 * coisa e mentir aqui é o que faz lembrete chegar atrasado.
 */
const INTERVALO_DO_CRON_MINUTOS = 1440;

export const Route = createFileRoute("/api/cron/lembretes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const segredo = process.env["CRON_SECRET"];
        // Sem segredo configurado, a rota fica fechada. O contrário — abrir
        // porque ninguém configurou — deixaria qualquer um disparar e-mail
        // em nome do prestador.
        if (!segredo) {
          console.error("[agenda] CRON_SECRET ausente; lembretes desligados.");
          return Response.json({ erro: "Não configurado" }, { status: 503 });
        }

        const enviado = request.headers.get("authorization") ?? "";
        if (!comparaEmTempoConstante(enviado, `Bearer ${segredo}`)) {
          return Response.json({ erro: "Não autorizado" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { emailDeLembrete, enviarEmail } = await import("@/lib/email.server");

        const agora = new Date();
        const tetoDaJanela = new Date(
          agora.getTime() + tetoDaConsultaMs(INTERVALO_DO_CRON_MINUTOS),
        );

        const { data: linhas, error } = await supabaseAdmin
          .from("appointments")
          .select(
            `id, starts_at, ends_at, client_name, client_email, notes, manage_token,
             services ( name, duration_minutes, price_cents ),
             providers ( display_name, timezone, contact_email, reminder_hours )`,
          )
          .eq("status", "confirmado")
          .is("reminder_sent_at", null)
          .gt("starts_at", agora.toISOString())
          .lte("starts_at", tetoDaJanela.toISOString())
          .order("starts_at")
          // Teto por execução, pra um pico não estourar o tempo limite da
          // função. Com cron diário não há "próxima passada em 15 minutos" pra
          // drenar a sobra: o que passar deste teto só sai amanhã. 300 cobre
          // com folga um dia de agenda cheia; se um dia não cobrir, o caminho é
          // aumentar a frequência do cron, não este número.
          .limit(300);

        if (error) {
          console.error("[agenda] falha ao listar lembretes:", error);
          return Response.json({ erro: "Falha na consulta" }, { status: 500 });
        }

        const base = (process.env["AGENDA_PUBLIC_URL"] ?? "http://localhost:8081").replace(
          /\/+$/,
          "",
        );

        let enviados = 0;
        let pulados = 0;

        for (const linha of linhas ?? []) {
          const servico = umDe(linha.services);
          const prestador = umDe(linha.providers);
          if (!servico || !prestador) {
            pulados++;
            continue;
          }

          // Regra e justificativa em src/lib/lembretes.ts, com os testes que
          // provam que nenhum agendamento fica sem aviso.
          const faltam = new Date(linha.starts_at).getTime() - agora.getTime();
          if (!deveEnviarAgora(faltam, prestador.reminder_hours, INTERVALO_DO_CRON_MINUTOS)) {
            pulados++;
            continue;
          }

          const lembrete = emailDeLembrete(
            {
              prestador: prestador.display_name,
              servico: servico.name,
              duracaoMinutos: servico.duration_minutes,
              precoCentavos: servico.price_cents,
              clienteNome: linha.client_name,
              clienteEmail: linha.client_email,
              inicio: new Date(linha.starts_at),
              timeZone: prestador.timezone,
              linkDeGestao: `${base}/agendamento/${linha.manage_token}`,
              observacao: linha.notes,
            },
            prestador.reminder_hours,
          );

          const ok = await enviarEmail({
            to: linha.client_email,
            ...lembrete,
            replyTo: prestador.contact_email ?? undefined,
          });

          if (ok) {
            // Marcado só depois do envio confirmado. Falha do Resend deixa a
            // linha intacta, e a próxima passada tenta de novo.
            await supabaseAdmin
              .from("appointments")
              .update({ reminder_sent_at: new Date().toISOString() })
              .eq("id", linha.id);
            enviados++;
          }
        }

        return Response.json({ enviados, pulados, analisados: linhas?.length ?? 0 });
      },
    },
  },
});

/**
 * Comparação sem vazar por tempo.
 *
 * `===` em string sai no primeiro byte diferente, o que em tese permite
 * descobrir o segredo byte a byte medindo a resposta. O custo de fazer
 * direito aqui é de duas linhas.
 */
function comparaEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

function umDe<T>(valor: T | T[] | null): T | null {
  if (valor === null) return null;
  return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}
