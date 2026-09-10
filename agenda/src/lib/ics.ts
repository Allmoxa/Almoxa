/**
 * Geração de iCalendar (RFC 5545).
 *
 * É por aqui que o compromisso chega no celular do prestador, e são duas
 * saídas diferentes pra dois problemas diferentes:
 *
 *   `montarFeed` produz um calendário assinável. O prestador assina uma vez
 *   (webcal://) e o iOS e o Google Agenda passam a buscar sozinhos — todo
 *   agendamento novo aparece no aparelho sem ninguém tocar em nada. É o que
 *   faz o "salva automaticamente" ser verdade.
 *
 *   `montarEventoUnico` produz um arquivo .ics de um compromisso só, pra
 *   anexar no e-mail do cliente e pro botão de baixar avulso. Quem abre
 *   escolhe adicionar; não sincroniza depois.
 *
 * Escrito na mão porque a especificação que importa aqui cabe em três regras
 * (CRLF, dobra em 75 octetos, escape de texto) e uma biblioteca traria um
 * gerador de recorrência inteiro que a agenda não usa.
 */

export type EventoIcs = {
  uid: string;
  inicio: Date;
  fim: Date;
  titulo: string;
  descricao?: string | undefined;
  local?: string | undefined;
  url?: string | undefined;
  /** Quando a linha mudou pela última vez — o cliente de calendário usa pra saber o que reescrever. */
  atualizadoEm: Date;
  cancelado?: boolean | undefined;
  /** Minutos antes do início pra o aparelho tocar o alarme. */
  alarmeMinutosAntes?: number | undefined;
};

const PRODID = "-//Almoxa//Agenda//PT-BR";

/** Calendário assinável com todos os compromissos do prestador. */
export function montarFeed(nomeDoCalendario: string, eventos: EventoIcs[]): string {
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapar(nomeDoCalendario)}`,
    // As duas dizem a mesma coisa pra públicos diferentes: REFRESH-INTERVAL é
    // o padrão (RFC 7986), X-PUBLISHED-TTL é o que o Outlook lê.
    "REFRESH-INTERVAL;VALUE=DURATION:PT30M",
    "X-PUBLISHED-TTL:PT30M",
  ];

  for (const evento of eventos) linhas.push(...linhasDoEvento(evento));
  linhas.push("END:VCALENDAR");

  return montar(linhas);
}

/** Arquivo .ics de um compromisso só. */
export function montarEventoUnico(evento: EventoIcs): string {
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    evento.cancelado ? "METHOD:CANCEL" : "METHOD:PUBLISH",
    ...linhasDoEvento(evento),
    "END:VCALENDAR",
  ];
  return montar(linhas);
}

function linhasDoEvento(evento: EventoIcs): string[] {
  const linhas = [
    "BEGIN:VEVENT",
    `UID:${evento.uid}`,
    `DTSTAMP:${paraDataIcs(evento.atualizadoEm)}`,
    `DTSTART:${paraDataIcs(evento.inicio)}`,
    `DTEND:${paraDataIcs(evento.fim)}`,
    `SUMMARY:${escapar(evento.titulo)}`,
    // SEQUENCE em segundos desde a época: qualquer atualização posterior gera
    // um número maior, que é o que o cliente de calendário usa pra decidir
    // que a versão nova substitui a que ele tem guardada.
    `SEQUENCE:${Math.floor(evento.atualizadoEm.getTime() / 1000)}`,
    `STATUS:${evento.cancelado ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
  ];

  if (evento.descricao) linhas.push(`DESCRIPTION:${escapar(evento.descricao)}`);
  if (evento.local) linhas.push(`LOCATION:${escapar(evento.local)}`);
  // URL não passa por escapar(): a vírgula de um link é parte do endereço, e
  // barra invertida ali quebraria o clique.
  if (evento.url) linhas.push(`URL:${evento.url}`);

  if (evento.alarmeMinutosAntes && evento.alarmeMinutosAntes > 0 && !evento.cancelado) {
    linhas.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapar(evento.titulo)}`,
      `TRIGGER:-PT${evento.alarmeMinutosAntes}M`,
      "END:VALARM",
    );
  }

  linhas.push("END:VEVENT");
  return linhas;
}

/** Data no formato UTC do iCalendar: 20260915T123000Z. */
export function paraDataIcs(data: Date): string {
  const p = (n: number, casas = 2) => String(n).padStart(casas, "0");
  return (
    `${p(data.getUTCFullYear(), 4)}${p(data.getUTCMonth() + 1)}${p(data.getUTCDate())}` +
    `T${p(data.getUTCHours())}${p(data.getUTCMinutes())}${p(data.getUTCSeconds())}Z`
  );
}

/**
 * Escape de texto do RFC 5545. A ordem importa: a barra invertida tem que ser
 * dobrada antes de a gente introduzir as outras, senão o escape do ";" vira
 * ele próprio candidato a escape na passada seguinte.
 */
export function escapar(texto: string): string {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

function montar(linhas: string[]): string {
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}

/**
 * Dobra em 75 octetos com continuação prefixada por espaço.
 *
 * O limite é em bytes, não em caracteres, e a agenda é em português: "ã" e
 * "ç" ocupam dois bytes cada em UTF-8. Cortar por índice de string estoura o
 * limite em nomes acentuados e, pior, pode partir um caractere no meio e
 * entregar bytes inválidos ao cliente de calendário. Por isso a conta é feita
 * sobre os code points, medindo o custo em bytes de cada um.
 */
export function dobrar(linha: string): string {
  if (byteLength(linha) <= 75) return linha;

  const pedacos: string[] = [];
  let atual = "";
  let bytes = 0;
  // Continuação começa com um espaço, que já consome um dos 75 octetos.
  let limite = 75;

  for (const caractere of linha) {
    const custo = byteLength(caractere);
    if (bytes + custo > limite) {
      pedacos.push(atual);
      atual = "";
      bytes = 0;
      limite = 74;
    }
    atual += caractere;
    bytes += custo;
  }
  if (atual) pedacos.push(atual);

  return pedacos.join("\r\n ");
}

function byteLength(texto: string): number {
  // TextEncoder existe no Node 18+ e em todo navegador que o app suporta.
  return new TextEncoder().encode(texto).length;
}
