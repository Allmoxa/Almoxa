import { createFileRoute } from "@tanstack/react-router";
import { montarFeed, type EventoIcs } from "@/agenda/lib/ics";
import { uidDoAgendamento } from "@/agenda/lib/booking.functions";

/**
 * Feed de calendário assinável do prestador.
 *
 * É isto que faz o compromisso "salvar sozinho" no celular: o prestador
 * assina a URL uma vez (webcal://…), e o iOS e o Google Agenda passam a
 * buscar de tempos em tempos por conta própria. Nada de exportar .ics a cada
 * agendamento novo.
 *
 * Autenticação é o token na própria URL — é o modelo que os clientes de
 * calendário suportam, porque eles buscam sozinhos, sem sessão nem cabeçalho
 * customizado. Por isso o token é uma coluna separada do id, e a tela de link
 * tem um botão pra girar ele.
 */
export const Route = createFileRoute("/api/calendario/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        // A URL termina em .ics porque cliente de calendário e servidor de
        // proxy se guiam pela extensão; o token de verdade é o que vem antes.
        const token = params.token.replace(/\.ics$/i, "");

        if (!/^[0-9a-f-]{36}$/i.test(token)) {
          return new Response("Não encontrado", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: provider } = await supabaseAdmin
          .from("providers")
          .select("id, display_name, timezone")
          .eq("calendar_token", token)
          .maybeSingle();

        // Mesma resposta pra token inexistente e token errado: nada aqui
        // deve ajudar a distinguir um do outro.
        if (!provider) return new Response("Não encontrado", { status: 404 });

        // Janela deliberadamente curta pra trás: calendário de celular não
        // precisa de histórico, e um feed que só cresce fica lento de baixar
        // no 4G. 60 dias atrás cobrem consulta recente; 365 à frente cobrem
        // qualquer agendamento que a régua do prestador permita marcar.
        const de = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
        const ate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

        const { data: linhas } = await supabaseAdmin
          .from("appointments")
          .select(
            `id, starts_at, ends_at, status, client_name, client_phone, client_email,
             notes, updated_at, services ( name )`,
          )
          .eq("provider_id", provider.id)
          .gte("starts_at", de)
          .lte("starts_at", ate)
          .order("starts_at");

        const eventos: EventoIcs[] = (linhas ?? []).map((linha) => {
          const servico = Array.isArray(linha.services) ? linha.services[0] : linha.services;
          const contato = [linha.client_email, linha.client_phone].filter(Boolean).join(" · ");
          const descricao = [
            `Cliente: ${linha.client_name}`,
            contato ? `Contato: ${contato}` : null,
            linha.notes ? `Observação: ${linha.notes}` : null,
          ]
            .filter(Boolean)
            .join("\n");

          return {
            uid: uidDoAgendamento(linha.id),
            inicio: new Date(linha.starts_at),
            fim: new Date(linha.ends_at),
            titulo: `${servico?.name ?? "Atendimento"} — ${linha.client_name}`,
            descricao,
            atualizadoEm: new Date(linha.updated_at),
            // Cancelado continua no feed de propósito: sem a linha marcada
            // como CANCELLED, o compromisso que o aparelho já baixou ficaria
            // lá pra sempre. É assim que ele some do celular.
            cancelado: linha.status === "cancelado",
            alarmeMinutosAntes: 30,
          };
        });

        const ics = montarFeed(`${provider.display_name} — Almoxá Agenda`, eventos);

        return new Response(ics, {
          status: 200,
          headers: {
            "content-type": "text/calendar; charset=utf-8",
            "content-disposition": 'inline; filename="almoxa-agenda.ics"',
            "cache-control": "no-store, max-age=0",
            "x-robots-tag": "noindex, nofollow",
          },
        });
      },
    },
  },
});
