/**
 * Agendamento público — o lado do cliente, que não tem login.
 *
 * Toda função aqui roda no servidor com a service role, porque o cliente não
 * tem sessão pra RLS avaliar. Isso troca "o banco protege" por "esta camada
 * protege", então cada handler abaixo é explícito sobre o que devolve: nunca
 * uma linha inteira de `providers` ou de `appointments`, sempre um objeto
 * montado à mão com os campos que a tela precisa. Um `select("*")` num
 * arquivo destes vaza o calendar_token do prestador ou o telefone de outro
 * cliente sem que nada acuse.
 */

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  diasComExpediente,
  gerarHorariosDoDia,
  janelaDeAgendamento,
  type Horario,
} from "@/lib/slots";
import { addDaysToIsoDate } from "@/lib/timezone";
import { agendarSchema, isoDateSchema, slugSchema } from "@/lib/validation";

export type ServicoPublico = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number | null;
};

export type AgendaPublica = {
  slug: string;
  displayName: string;
  headline: string | null;
  timeZone: string;
  accepting: boolean;
  servicos: ServicoPublico[];
  /** Dias que têm expediente na janela, pra tela não oferecer domingo fechado. */
  diasDisponiveis: string[];
  primeiroDia: string;
  ultimoDia: string;
};

/** Erro cuja mensagem pode aparecer pro usuário. Erro cru vira texto genérico. */
class ErroDeAgenda extends Error {}

function urlPublica(): string {
  return (process.env["AGENDA_PUBLIC_URL"] ?? "http://localhost:8081").replace(/\/+$/, "");
}

function ipDaRequisicao(): string {
  const forwarded = getRequest()?.headers.get("x-forwarded-for") ?? "";
  return (forwarded.split(",")[0] ?? "").trim() || "desconhecido";
}

// ---------------------------------------------------------------------------
// Leitura da página pública
// ---------------------------------------------------------------------------

export const carregarAgendaPublica = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ slug: slugSchema }).parse(data))
  // Devolve null, não lança, quando o slug não existe: link digitado errado é
  // "não encontrado", e a rota converte isso na página 404. Lançar aqui daria
  // "erro do servidor" pra um endereço simplesmente inexistente.
  .handler(async ({ data }): Promise<AgendaPublica | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: provider, error } = await supabaseAdmin
      .from("providers")
      .select(
        "id, slug, display_name, headline, timezone, accepting, max_days_ahead, slot_interval_minutes",
      )
      .eq("slug", data.slug)
      .maybeSingle();

    // Banco fora do ar ou migration não aplicada não é "agenda não existe":
    // engolir o erro aqui mostraria 404 pra todo mundo e esconderia a causa.
    if (error) {
      console.error("[agenda] falha ao carregar prestador:", error);
      throw new ErroDeAgenda("Não foi possível abrir esta agenda agora.");
    }
    if (!provider) return null;

    const [{ data: servicos }, { data: regras }] = await Promise.all([
      supabaseAdmin
        .from("services")
        .select("id, name, description, duration_minutes, price_cents")
        .eq("provider_id", provider.id)
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      supabaseAdmin.from("availability_rules").select("weekday").eq("provider_id", provider.id),
    ]);

    const janela = janelaDeAgendamento(
      { timeZone: provider.timezone, maxDaysAhead: provider.max_days_ahead },
      new Date(),
    );

    return {
      slug: provider.slug,
      displayName: provider.display_name,
      headline: provider.headline,
      timeZone: provider.timezone,
      accepting: provider.accepting,
      servicos: servicos ?? [],
      diasDisponiveis: diasComExpediente(
        (regras ?? []).map((r) => ({ weekday: r.weekday, starts_at: "00:00", ends_at: "23:59" })),
        janela.primeiroDia,
        janela.ultimoDia,
      ),
      primeiroDia: janela.primeiroDia,
      ultimoDia: janela.ultimoDia,
    };
  });

export const carregarHorarios = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z
      .object({ slug: slugSchema, serviceId: z.string().uuid(), isoDate: isoDateSchema })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ horarios: Horario[] }> => {
    const contexto = await montarContexto(data.slug, data.serviceId, data.isoDate);
    return { horarios: contexto.horarios };
  });

// ---------------------------------------------------------------------------
// Confirmação
// ---------------------------------------------------------------------------

export type ResultadoDoAgendamento = {
  token: string;
  inicio: string;
  fim: string;
  servico: string;
  prestador: string;
  timeZone: string;
  emailEnviado: boolean;
};

export const confirmarAgendamento = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => agendarSchema.parse(data))
  .handler(async ({ data }): Promise<ResultadoDoAgendamento> => {
    // Honeypot: bot que preenche o campo escondido recebe um "ok" que não
    // gravou nada. Devolver erro só ensinaria o bot a tentar de novo.
    if (data.website) {
      return {
        token: "00000000-0000-0000-0000-000000000000",
        inicio: data.inicio,
        fim: data.inicio,
        servico: "",
        prestador: "",
        timeZone: "UTC",
        emailEnviado: false,
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const consumirCota = supabaseAdmin.rpc as unknown as (
      fn: "consume_booking_quota",
      args: { _ip: string },
    ) => Promise<{ data: boolean | null; error: { message: string } | null }>;

    const { data: dentroDoTeto, error: erroDeCota } = await consumirCota("consume_booking_quota", {
      _ip: ipDaRequisicao(),
    });
    // Freio que não responde não vira porta aberta.
    if (erroDeCota) throw new ErroDeAgenda("Não foi possível concluir agora. Tente em instantes.");
    if (!dentroDoTeto) {
      throw new ErroDeAgenda("Muitos agendamentos deste dispositivo. Aguarde um pouco.");
    }

    const inicio = new Date(data.inicio);
    const isoDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(inicio);

    // A grade é recalculada aqui, agora, nos dois dias que o instante pode
    // tocar no fuso do prestador. O que o navegador mandou é uma proposta —
    // ela pode ter minutos de idade, e nesse meio-tempo alguém pode ter
    // marcado, ou o prestador pode ter posto folga.
    const contexto = await montarContexto(data.slug, data.serviceId, isoDate, [
      addDaysToIsoDate(isoDate, -1),
      addDaysToIsoDate(isoDate, 1),
    ]);

    const escolhido = contexto.horarios.find((h) => h.inicio === inicio.toISOString());
    if (!escolhido) throw new ErroDeAgenda("Esse horário não está mais na agenda.");
    if (!escolhido.livre) throw new ErroDeAgenda("Esse horário acabou de ser preenchido.");
    if (!contexto.provider.accepting)
      throw new ErroDeAgenda("Esta agenda está fechada no momento.");

    const { data: criado, error } = await supabaseAdmin
      .from("appointments")
      .insert({
        provider_id: contexto.provider.id,
        service_id: contexto.servico.id,
        client_name: data.nome,
        client_email: data.email,
        client_phone: data.telefone || null,
        notes: data.observacao || null,
        starts_at: escolhido.inicio,
        ends_at: escolhido.fim,
      })
      .select("id, manage_token, starts_at, ends_at")
      .single();

    if (error) {
      // 23P01 é a constraint appointments_sem_sobreposicao. É o desfecho
      // esperado quando dois clientes confirmam o mesmo horário no mesmo
      // segundo: os dois passaram pela checagem acima, o banco escolheu um.
      if (error.code === "23P01") {
        throw new ErroDeAgenda("Esse horário acabou de ser preenchido. Escolha outro.");
      }
      console.error("[agenda] falha ao gravar agendamento:", error);
      throw new ErroDeAgenda("Não foi possível concluir o agendamento. Tente de novo.");
    }

    const linkDeGestao = `${urlPublica()}/agendamento/${criado.manage_token}`;
    const { emailDeConfirmacao, emailDeNovoAgendamento, anexoDoEvento, enviarEmail } =
      await import("@/lib/email.server");

    const dadosDoEmail = {
      prestador: contexto.provider.display_name,
      servico: contexto.servico.name,
      duracaoMinutos: contexto.servico.duration_minutes,
      precoCentavos: contexto.servico.price_cents,
      clienteNome: data.nome,
      clienteEmail: data.email,
      inicio: new Date(criado.starts_at),
      timeZone: contexto.provider.timezone,
      linkDeGestao,
      observacao: data.observacao ?? null,
    };

    const confirmacao = emailDeConfirmacao(dadosDoEmail);
    const emailEnviado = await enviarEmail({
      to: data.email,
      ...confirmacao,
      replyTo: contexto.provider.contact_email ?? undefined,
      attachments: [
        anexoDoEvento(dadosDoEmail, uidDoAgendamento(criado.id), new Date(criado.ends_at)),
      ],
    });

    if (emailEnviado) {
      await supabaseAdmin
        .from("appointments")
        .update({ confirmation_sent_at: new Date().toISOString() })
        .eq("id", criado.id);
    }

    // Aviso pro prestador. Falhar aqui não muda nada pro cliente, que já viu
    // a confirmação — por isso não é aguardado junto do resto.
    if (contexto.provider.contact_email) {
      const aviso = emailDeNovoAgendamento(dadosDoEmail);
      await enviarEmail({
        to: contexto.provider.contact_email,
        ...aviso,
        replyTo: data.email,
      });
    }

    return {
      token: criado.manage_token,
      inicio: criado.starts_at,
      fim: criado.ends_at,
      servico: contexto.servico.name,
      prestador: contexto.provider.display_name,
      timeZone: contexto.provider.timezone,
      emailEnviado,
    };
  });

// ---------------------------------------------------------------------------
// Página do cliente: ver e desmarcar pelo token
// ---------------------------------------------------------------------------

export type AgendamentoDoCliente = {
  token: string;
  servico: string;
  prestador: string;
  prestadorSlug: string;
  duracaoMinutos: number;
  precoCentavos: number | null;
  inicio: string;
  fim: string;
  timeZone: string;
  status: "confirmado" | "cancelado" | "concluido";
  clienteNome: string;
  observacao: string | null;
  /** Falso quando já passou — a tela esconde o botão de desmarcar. */
  podeCancelar: boolean;
};

const tokenSchema = z.object({ token: z.string().uuid({ message: "Link inválido" }) });

export const carregarAgendamento = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  // Null em vez de exceção, mesmo motivo de carregarAgendaPublica: token que
  // não existe é 404, não falha do servidor.
  .handler(async ({ data }): Promise<AgendamentoDoCliente | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: linha, error } = await supabaseAdmin
      .from("appointments")
      .select(
        `manage_token, starts_at, ends_at, status, client_name, notes,
         services ( name, duration_minutes, price_cents ),
         providers ( display_name, slug, timezone )`,
      )
      .eq("manage_token", data.token)
      .maybeSingle();

    if (error) {
      console.error("[agenda] falha ao carregar agendamento:", error);
      throw new ErroDeAgenda("Não foi possível abrir este agendamento agora.");
    }
    if (!linha) return null;

    const servico = umDe(linha.services);
    const prestador = umDe(linha.providers);
    if (!servico || !prestador) return null;

    return {
      token: linha.manage_token,
      servico: servico.name,
      prestador: prestador.display_name,
      prestadorSlug: prestador.slug,
      duracaoMinutos: servico.duration_minutes,
      precoCentavos: servico.price_cents,
      inicio: linha.starts_at,
      fim: linha.ends_at,
      timeZone: prestador.timezone,
      status: linha.status,
      clienteNome: linha.client_name,
      observacao: linha.notes,
      podeCancelar: linha.status === "confirmado" && new Date(linha.starts_at) > new Date(),
    };
  });

export const cancelarPeloCliente = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: linha } = await supabaseAdmin
      .from("appointments")
      .select(
        `id, starts_at, ends_at, status, client_name, client_email, notes,
         services ( name, duration_minutes, price_cents ),
         providers ( display_name, timezone, contact_email )`,
      )
      .eq("manage_token", data.token)
      .maybeSingle();

    if (!linha) throw new ErroDeAgenda("Não encontramos esse agendamento.");
    if (linha.status === "cancelado") return { ok: true };
    if (new Date(linha.starts_at) <= new Date()) {
      throw new ErroDeAgenda("Esse horário já passou e não pode mais ser desmarcado.");
    }

    // O WHERE repete status = 'confirmado' pra dois cliques no mesmo botão
    // não gerarem dois e-mails de cancelamento.
    const { data: cancelado, error } = await supabaseAdmin
      .from("appointments")
      .update({
        status: "cancelado",
        cancelled_at: new Date().toISOString(),
        cancelled_by: "cliente",
      })
      .eq("id", linha.id)
      .eq("status", "confirmado")
      .select("id")
      .maybeSingle();

    if (error) throw new ErroDeAgenda("Não foi possível desmarcar. Tente de novo.");
    if (!cancelado) return { ok: true };

    const servico = umDe(linha.services);
    const prestador = umDe(linha.providers);
    if (!servico || !prestador) return { ok: true };

    const { emailDeCancelamento, anexoDoEvento, enviarEmail } = await import("@/lib/email.server");

    const dadosDoEmail = {
      prestador: prestador.display_name,
      servico: servico.name,
      duracaoMinutos: servico.duration_minutes,
      precoCentavos: servico.price_cents,
      clienteNome: linha.client_name,
      clienteEmail: linha.client_email,
      inicio: new Date(linha.starts_at),
      timeZone: prestador.timezone,
      linkDeGestao: `${urlPublica()}/agendamento/${data.token}`,
      observacao: linha.notes,
    };

    const aviso = emailDeCancelamento(dadosDoEmail, "cliente");
    await enviarEmail({
      to: linha.client_email,
      ...aviso,
      // O .ics de cancelamento tira o compromisso do calendário de quem já
      // tinha adicionado o convite da confirmação.
      attachments: [
        anexoDoEvento(dadosDoEmail, uidDoAgendamento(linha.id), new Date(linha.ends_at), true),
      ],
    });

    if (prestador.contact_email) {
      await enviarEmail({ to: prestador.contact_email, ...aviso });
    }

    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

/** UID estável do evento: o mesmo agendamento sempre gera o mesmo identificador. */
export function uidDoAgendamento(id: string): string {
  return `${id}@almoxa-agenda`;
}

/**
 * O PostgREST devolve relação embutida ora como objeto, ora como array de um,
 * dependendo de como ele infere a cardinalidade. Normalizar aqui evita
 * espalhar `Array.isArray` por toda função que faz join.
 */
function umDe<T>(valor: T | T[] | null): T | null {
  if (valor === null) return null;
  return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}

type Contexto = {
  provider: {
    id: string;
    slug: string;
    display_name: string;
    timezone: string;
    accepting: boolean;
    contact_email: string | null;
    slot_interval_minutes: number;
    min_notice_minutes: number;
    buffer_minutes: number;
    max_days_ahead: number;
  };
  servico: {
    id: string;
    name: string;
    duration_minutes: number;
    price_cents: number | null;
  };
  horarios: Horario[];
};

/**
 * Carrega prestador + serviço e devolve a grade daquele dia.
 *
 * `diasExtras` existe porque um agendamento à noite no fuso do prestador cai
 * no dia seguinte em UTC (e de manhã cedo, no anterior). Na confirmação a
 * grade é montada também pros dias vizinhos, senão um horário legítimo das
 * 22h seria recusado por "não está na agenda".
 */
async function montarContexto(
  slug: string,
  serviceId: string,
  isoDate: string,
  diasExtras: string[] = [],
): Promise<Contexto> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: provider } = await supabaseAdmin
    .from("providers")
    .select(
      `id, slug, display_name, timezone, accepting, contact_email,
       slot_interval_minutes, min_notice_minutes, buffer_minutes, max_days_ahead`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!provider) throw new ErroDeAgenda("Essa agenda não existe.");

  const { data: servico } = await supabaseAdmin
    .from("services")
    .select("id, name, duration_minutes, price_cents")
    .eq("id", serviceId)
    .eq("provider_id", provider.id)
    .eq("active", true)
    .maybeSingle();

  if (!servico) throw new ErroDeAgenda("Esse serviço não está mais disponível.");

  const dias = [...new Set([isoDate, ...diasExtras])].sort();
  const primeiro = dias[0] ?? isoDate;
  const ultimo = dias[dias.length - 1] ?? isoDate;

  // Janela folgada de um dia pra cada lado na consulta: um atendimento longo
  // que começou ontem à noite ainda ocupa o começo de hoje.
  const de = `${addDaysToIsoDate(primeiro, -1)}T00:00:00Z`;
  const ate = `${addDaysToIsoDate(ultimo, 2)}T00:00:00Z`;

  const [{ data: regras }, { data: bloqueios }, { data: ocupados }] = await Promise.all([
    supabaseAdmin
      .from("availability_rules")
      .select("weekday, starts_at, ends_at")
      .eq("provider_id", provider.id),
    supabaseAdmin
      .from("availability_blocks")
      .select("starts_at, ends_at")
      .eq("provider_id", provider.id)
      .lt("starts_at", ate)
      .gt("ends_at", de),
    supabaseAdmin
      .from("appointments")
      .select("starts_at, ends_at")
      .eq("provider_id", provider.id)
      .neq("status", "cancelado")
      .lt("starts_at", ate)
      .gt("ends_at", de),
  ]);

  const agora = new Date();
  const config = {
    timeZone: provider.timezone,
    slotIntervalMinutes: provider.slot_interval_minutes,
    bufferMinutes: provider.buffer_minutes,
    minNoticeMinutes: provider.min_notice_minutes,
    maxDaysAhead: provider.max_days_ahead,
  };

  const horarios = dias.flatMap((dia) =>
    gerarHorariosDoDia({
      isoDate: dia,
      duracaoMinutos: servico.duration_minutes,
      config,
      regras: regras ?? [],
      bloqueios: bloqueios ?? [],
      ocupados: ocupados ?? [],
      agora,
    }),
  );

  return { provider, servico, horarios };
}
