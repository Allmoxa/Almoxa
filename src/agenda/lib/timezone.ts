/**
 * Conversão entre hora de parede e instante, sem dependência externa.
 *
 * O expediente é guardado como "terça, das 09:00 às 18:00" — hora local do
 * prestador, sem fuso. O agendamento é guardado como instante (TIMESTAMPTZ).
 * Alguém precisa costurar os dois, e é aqui.
 *
 * Tudo sai do Intl: ele já carrega a base de fusos do sistema, incluindo as
 * viradas de horário de verão. O Brasil não tem mais DST desde 2019, mas
 * `timezone` é campo livre no cadastro do prestador — e uma agenda que erra
 * uma hora duas vezes por ano erra do jeito mais caro possível.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let dtf = formatters.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, dtf);
  }
  return dtf;
}

export type WallTime = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = domingo, igual ao getDay() do JS e ao availability_rules.weekday. */
  weekday: number;
};

/** Verdadeiro se o Intl reconhece o fuso — usado pra validar o cadastro. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Relógio de parede daquele fuso no instante dado. */
export function instantToWall(instant: Date, timeZone: string): WallTime {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };

  const year = get("year");
  const month = get("month");
  const day = get("day");

  return {
    year,
    month,
    day,
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
    weekday: weekdayOfCalendarDate(year, month, day),
  };
}

/**
 * Quanto o fuso está adiantado em relação ao UTC naquele instante, em ms.
 * São Paulo devolve -10800000 (-3h).
 */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const wall = instantToWall(instant, timeZone);
  const asUtc = utcFromParts(wall.year, wall.month, wall.day, wall.hour, wall.minute, wall.second);
  // O Intl não devolve milissegundos; truncar dos dois lados evita que o
  // resto de ms vire um offset de -999ms.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Instante em que aquele relógio de parede acontece naquele fuso.
 *
 * Duas passadas: a primeira chuta o offset olhando o horário como se fosse
 * UTC, a segunda confere o offset no instante corrigido. As duas só divergem
 * perto de uma virada de horário de verão — e é exatamente lá que uma passada
 * só erraria a hora.
 *
 * Hora que não existe (o pulo da primavera) cai logo depois do buraco; hora
 * repetida (o recuo do outono) resolve pela primeira ocorrência.
 */
export function wallTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const comoUtc = utcFromParts(year, month, day, hour, minute, 0);

  const primeiro = zoneOffsetMs(new Date(comoUtc), timeZone);
  let ts = comoUtc - primeiro;

  const segundo = zoneOffsetMs(new Date(ts), timeZone);
  if (segundo !== primeiro) ts = comoUtc - segundo;

  return new Date(ts);
}

/** "2026-09-15" + "09:30" naquele fuso → instante. */
export function isoDateTimeToInstant(isoDate: string, timeOfDay: string, timeZone: string): Date {
  const { year, month, day } = parseIsoDate(isoDate);
  const { hour, minute } = parseTimeOfDay(timeOfDay);
  return wallTimeToInstant(year, month, day, hour, minute, timeZone);
}

/** Data do calendário local daquele fuso, no formato "2026-09-15". */
export function instantToIsoDate(instant: Date, timeZone: string): string {
  const { year, month, day } = instantToWall(instant, timeZone);
  return `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
}

/** Hora local no formato "09:30". */
export function instantToTimeOfDay(instant: Date, timeZone: string): string {
  const { hour, minute } = instantToWall(instant, timeZone);
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** "2026-09-15" → { year: 2026, month: 9, day: 15 }. Lança se não bater. */
export function parseIsoDate(isoDate: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) throw new Error(`Data inválida: ${isoDate}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Data inválida: ${isoDate}`);
  }
  return { year, month, day };
}

/** "09:30" ou "09:30:00" (o Postgres devolve com segundos) → minutos. */
export function parseTimeOfDay(timeOfDay: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(timeOfDay);
  if (!m) throw new Error(`Horário inválido: ${timeOfDay}`);
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) throw new Error(`Horário inválido: ${timeOfDay}`);
  return { hour, minute };
}

/** Minutos desde a meia-noite. Útil pra comparar faixas do expediente. */
export function minutesOfDay(timeOfDay: string): number {
  const { hour, minute } = parseTimeOfDay(timeOfDay);
  return hour * 60 + minute;
}

/** Dia da semana (0 = domingo) de uma data do calendário, sem passar por fuso. */
export function weekdayOfCalendarDate(year: number, month: number, day: number): number {
  return new Date(utcFromParts(year, month, day, 0, 0, 0)).getUTCDay();
}

/** Soma dias a uma data "2026-09-15", em calendário — não em milissegundos. */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const { year, month, day } = parseIsoDate(isoDate);
  const d = new Date(utcFromParts(year, month, day, 0, 0, 0));
  d.setUTCDate(d.getUTCDate() + days);
  return `${pad4(d.getUTCFullYear())}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Date.UTC() joga ano de 0 a 99 pra 1900+ano. Não é caso que a agenda veja,
 * mas o conserto é uma linha e evita um bug silencioso caso um ano assim
 * chegue aqui por outro caminho.
 */
function utcFromParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number {
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  if (year >= 0 && year < 100) {
    const d = new Date(ms);
    d.setUTCFullYear(year);
    return d.getTime();
  }
  return ms;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}
