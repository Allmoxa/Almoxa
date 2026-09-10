/**
 * Montagem e envio dos e-mails da agenda.
 *
 * `.server.ts` de propósito: importa a chave do Resend e o cliente com service
 * role. O vite.config.ts tem importProtection ligado — se este módulo for
 * puxado por um arquivo que vai pro bundle do navegador, o build quebra em vez
 * de vazar a chave.
 *
 * Todo e-mail sai em HTML e em texto puro. O texto não é enfeite: cliente de
 * e-mail corporativo bloqueia HTML por padrão, e um lembrete que chega em
 * branco é pior do que lembrete nenhum.
 */

import { montarEventoUnico, type EventoIcs } from "@/agenda/lib/ics";
import { formatarDuracao, formatarPreco } from "@/agenda/lib/validation";

export type DadosDoEmail = {
  prestador: string;
  servico: string;
  duracaoMinutos: number;
  precoCentavos: number | null;
  clienteNome: string;
  clienteEmail: string;
  inicio: Date;
  timeZone: string;
  linkDeGestao: string;
  observacao?: string | null | undefined;
};

const PALETA = {
  papel: "#faf9f5",
  tinta: "#2d2b26",
  suave: "#83827d",
  borda: "#dad9d4",
  ambar: "#c96442",
};

/** "terça-feira, 15 de setembro de 2026, às 09:00". */
export function porExtenso(instante: Date, timeZone: string): string {
  const data = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(instante);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(instante);
  return `${data}, às ${hora}`;
}

/**
 * Escape de HTML pros campos que o cliente digitou.
 *
 * Nome e observação entram no corpo do e-mail, e o corpo é HTML. Sem isto,
 * um nome com "<" quebra o layout — e um com "<img src=x onerror=...>" vira
 * tentativa de injeção na caixa de entrada do prestador.
 */
function esc(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function moldura(titulo: string, chamada: string, corpo: string, rodape: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title></head>
<body style="margin:0;padding:24px 12px;background:${PALETA.papel};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${PALETA.tinta}">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto">
    <tr><td style="padding:0 0 20px">
      <span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:600;letter-spacing:-0.01em">[ Almoxá Agenda ]</span>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${PALETA.borda};border-radius:10px;padding:28px 24px">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${PALETA.suave}">${esc(chamada)}</p>
      <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:400;line-height:1.25">${esc(titulo)}</h1>
      ${corpo}
    </td></tr>
    <tr><td style="padding:18px 4px 0;font-size:12px;line-height:1.6;color:${PALETA.suave}">${rodape}</td></tr>
  </table>
</body></html>`;
}

function linhaDeDados(rotulo: string, valor: string): string {
  return `<tr>
    <td style="padding:7px 0;font-size:13px;color:${PALETA.suave};white-space:nowrap;vertical-align:top">${esc(rotulo)}</td>
    <td style="padding:7px 0 7px 16px;font-size:14px;vertical-align:top">${esc(valor)}</td>
  </tr>`;
}

function tabelaDoAgendamento(dados: DadosDoEmail): string {
  const linhas = [
    linhaDeDados("Serviço", dados.servico),
    linhaDeDados("Quando", porExtenso(dados.inicio, dados.timeZone)),
    linhaDeDados("Duração", formatarDuracao(dados.duracaoMinutos)),
    linhaDeDados("Valor", formatarPreco(dados.precoCentavos)),
    linhaDeDados("Com", dados.prestador),
  ];
  if (dados.observacao) linhas.push(linhaDeDados("Observação", dados.observacao));
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">${linhas.join("")}</table>`;
}

function botao(href: string, texto: string): string {
  return `<a href="${href}" style="display:inline-block;background:${PALETA.tinta};color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:7px;font-size:14px;font-weight:500">${esc(texto)}</a>`;
}

function blocoTexto(dados: DadosDoEmail): string {
  const partes = [
    `Serviço: ${dados.servico}`,
    `Quando: ${porExtenso(dados.inicio, dados.timeZone)}`,
    `Duração: ${formatarDuracao(dados.duracaoMinutos)}`,
    `Valor: ${formatarPreco(dados.precoCentavos)}`,
    `Com: ${dados.prestador}`,
  ];
  if (dados.observacao) partes.push(`Observação: ${dados.observacao}`);
  return partes.join("\n");
}

export function emailDeConfirmacao(dados: DadosDoEmail) {
  const corpo = `
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6">Olá, ${esc(dados.clienteNome.split(" ")[0] ?? dados.clienteNome)}! Seu horário está reservado.</p>
    ${tabelaDoAgendamento(dados)}
    <div style="margin:24px 0 0;padding:18px 0 0;border-top:1px solid ${PALETA.borda}">
      ${botao(dados.linkDeGestao, "Ver ou desmarcar")}
      <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:${PALETA.suave}">O convite em anexo adiciona este horário ao seu calendário.</p>
    </div>`;

  return {
    subject: `Confirmado: ${dados.servico} — ${porExtenso(dados.inicio, dados.timeZone)}`,
    html: moldura(
      "Horário confirmado",
      "Confirmação",
      corpo,
      "Precisa remarcar? Use o link acima.",
    ),
    text: `Olá, ${dados.clienteNome}! Seu horário está reservado.\n\n${blocoTexto(dados)}\n\nVer ou desmarcar: ${dados.linkDeGestao}\n`,
  };
}

export function emailDeLembrete(dados: DadosDoEmail, horasAntes: number) {
  const quando = horasAntes >= 24 ? "amanhã" : `em cerca de ${horasAntes}h`;
  const corpo = `
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6">Passando pra lembrar do seu horário ${esc(quando)}.</p>
    ${tabelaDoAgendamento(dados)}
    <div style="margin:24px 0 0;padding:18px 0 0;border-top:1px solid ${PALETA.borda}">
      ${botao(dados.linkDeGestao, "Ver ou desmarcar")}
    </div>`;

  return {
    subject: `Lembrete: ${dados.servico} — ${porExtenso(dados.inicio, dados.timeZone)}`,
    html: moldura(
      `Seu horário é ${quando}`,
      "Lembrete",
      corpo,
      "Não vai dar? Avise pelo link acima.",
    ),
    text: `Lembrete do seu horário ${quando}.\n\n${blocoTexto(dados)}\n\nVer ou desmarcar: ${dados.linkDeGestao}\n`,
  };
}

export function emailDeCancelamento(dados: DadosDoEmail, porQuem: "cliente" | "prestador") {
  const chamada = porQuem === "cliente" ? "Cancelado por você" : "Cancelado pelo prestador";
  const corpo = `
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6">Este horário foi desmarcado e não vale mais.</p>
    ${tabelaDoAgendamento(dados)}`;

  return {
    subject: `Cancelado: ${dados.servico} — ${porExtenso(dados.inicio, dados.timeZone)}`,
    html: moldura(
      "Horário cancelado",
      chamada,
      corpo,
      "Quiser remarcar, é só abrir a agenda de novo.",
    ),
    text: `Este horário foi desmarcado.\n\n${blocoTexto(dados)}\n`,
  };
}

/** Aviso pro prestador de que entrou gente nova na agenda. */
export function emailDeNovoAgendamento(dados: DadosDoEmail) {
  const contato = [dados.clienteEmail, dados.observacao ? null : null].filter(Boolean).join(" · ");
  const corpo = `
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6"><strong>${esc(dados.clienteNome)}</strong> marcou um horário com você.</p>
    ${tabelaDoAgendamento(dados)}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:2px">
      ${linhaDeDados("Contato", contato)}
    </table>`;

  return {
    subject: `Novo agendamento: ${dados.clienteNome} — ${porExtenso(dados.inicio, dados.timeZone)}`,
    html: moldura("Entrou na sua agenda", "Novo agendamento", corpo, "Almoxá Agenda"),
    text: `${dados.clienteNome} marcou um horário.\n\n${blocoTexto(dados)}\nContato: ${dados.clienteEmail}\n`,
  };
}

export type AnexoIcs = { filename: string; content: string };

/** Convite de calendário pronto pra virar anexo do Resend. */
export function anexoDoEvento(
  dados: DadosDoEmail,
  uid: string,
  fim: Date,
  cancelado = false,
): AnexoIcs {
  const evento: EventoIcs = {
    uid,
    inicio: dados.inicio,
    fim,
    titulo: `${dados.servico} — ${dados.prestador}`,
    descricao: dados.observacao
      ? `${dados.servico} com ${dados.prestador}.\n\nObservação: ${dados.observacao}`
      : `${dados.servico} com ${dados.prestador}.`,
    url: dados.linkDeGestao,
    atualizadoEm: new Date(),
    cancelado,
    alarmeMinutosAntes: 60,
  };
  return {
    filename: cancelado ? "cancelamento.ics" : "agendamento.ics",
    // O Resend aceita o conteúdo do anexo em base64.
    content: Buffer.from(montarEventoUnico(evento), "utf8").toString("base64"),
  };
}

/**
 * Envia, e nunca derruba o fluxo por causa disso.
 *
 * O agendamento já está gravado quando esta função roda. Se o Resend estiver
 * fora do ar, perder o e-mail é ruim; perder o horário que o cliente acabou
 * de marcar, porque o envio estourou uma exceção, é bem pior. Falha vira log
 * e um `false` — quem chama decide o que dizer na tela.
 */
export async function enviarEmail(opcoes: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | undefined;
  attachments?: AnexoIcs[] | undefined;
}): Promise<boolean> {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["AGENDA_EMAIL_FROM"] ?? "Almoxá Agenda <onboarding@resend.dev>";
  if (!apiKey) {
    console.warn("[agenda] RESEND_API_KEY ausente — e-mail não enviado:", opcoes.subject);
    return false;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: [opcoes.to],
      // Assunto vai num cabeçalho da mensagem, e quebra de linha ali é o vetor
      // clássico pra pendurar um Bcc. O nome do serviço entra no assunto e é
      // texto que o prestador digitou.
      subject: opcoes.subject.replace(/[\r\n]+/g, " "),
      html: opcoes.html,
      text: opcoes.text,
      ...(opcoes.replyTo ? { replyTo: opcoes.replyTo } : {}),
      ...(opcoes.attachments ? { attachments: opcoes.attachments } : {}),
    });
    if (error) {
      console.error("[agenda] Resend recusou o envio:", error);
      return false;
    }
    return true;
  } catch (erro) {
    console.error("[agenda] falha ao enviar e-mail:", erro);
    return false;
  }
}
