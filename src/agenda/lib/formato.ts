/**
 * Formatação de data e hora pra tela, sempre no fuso do prestador.
 *
 * Isto importa mais do que parece: quem agenda pode estar em outro fuso do
 * prestador. "09:00" tem que significar nove da manhã na cadeira dele, não no
 * relógio de quem está marcando. Por isso nenhuma função aqui usa o fuso do
 * navegador — todas recebem `timeZone` e passam adiante pro Intl.
 *
 * Os formatadores ficam em cache: a grade de horários chama isso dezenas de
 * vezes por render, e construir um Intl.DateTimeFormat não é barato.
 */

const cache = new Map<string, Intl.DateTimeFormat>();

function fmt(timeZone: string, opcoes: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const chave = `${timeZone}|${JSON.stringify(opcoes)}`;
  let formatador = cache.get(chave);
  if (!formatador) {
    formatador = new Intl.DateTimeFormat("pt-BR", { timeZone, ...opcoes });
    cache.set(chave, formatador);
  }
  return formatador;
}

function comoData(valor: Date | string): Date {
  return typeof valor === "string" ? new Date(valor) : valor;
}

/** "09:30" */
export function hora(valor: Date | string, timeZone: string): string {
  return fmt(timeZone, { hour: "2-digit", minute: "2-digit" }).format(comoData(valor));
}

/** "15 de setembro" */
export function diaEMes(valor: Date | string, timeZone: string): string {
  return fmt(timeZone, { day: "numeric", month: "long" }).format(comoData(valor));
}

/** "terça-feira, 15 de setembro" */
export function diaPorExtenso(valor: Date | string, timeZone: string): string {
  return fmt(timeZone, { weekday: "long", day: "numeric", month: "long" }).format(comoData(valor));
}

/** "ter, 15 de set de 2026, 09:30" — o texto do comprovante. */
export function completo(valor: Date | string, timeZone: string): string {
  return fmt(timeZone, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(comoData(valor));
}

/**
 * Partes de um dia do calendário ("2026-09-15") pra faixa de dias.
 *
 * Aqui a data é lida como calendário puro, com `timeZone: "UTC"` fixo: a
 * string já é o dia local do prestador, e reinterpretá-la em outro fuso a
 * empurraria um dia pra trás pra quem estiver a leste.
 */
export function partesDoDia(isoDate: string): {
  diaDaSemana: string;
  numero: string;
  mes: string;
} {
  const data = new Date(`${isoDate}T12:00:00Z`);
  const emUtc = (opcoes: Intl.DateTimeFormatOptions) =>
    fmt("UTC", opcoes).format(data).replace(".", "");

  return {
    diaDaSemana: emUtc({ weekday: "short" }),
    numero: emUtc({ day: "numeric" }),
    mes: emUtc({ month: "short" }),
  };
}

/** "Hoje", "Amanhã" ou "terça-feira, 15 de setembro". */
export function diaRelativo(isoDate: string, hojeIsoDate: string): string | null {
  if (isoDate === hojeIsoDate) return "Hoje";
  const hoje = new Date(`${hojeIsoDate}T12:00:00Z`);
  hoje.setUTCDate(hoje.getUTCDate() + 1);
  if (isoDate === hoje.toISOString().slice(0, 10)) return "Amanhã";
  return null;
}

/**
 * Nome do fuso pra mostrar quando o cliente está num fuso diferente do
 * prestador. Sem isso, "09:00" numa marcação internacional é ambíguo.
 */
export function fusoDoNavegador(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/** "GMT-3" — curto o bastante pra caber ao lado do horário. */
export function siglaDoFuso(valor: Date | string, timeZone: string): string {
  const partes = fmt(timeZone, { timeZoneName: "shortOffset" }).formatToParts(comoData(valor));
  return partes.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}
