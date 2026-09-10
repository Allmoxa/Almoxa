/**
 * Geração dos horários de um dia.
 *
 * Fica em módulo próprio, sem tocar em Supabase nem em React, por dois
 * motivos: o servidor precisa refazer a conta na hora de confirmar (a lista
 * que o cliente viu pode ter minutos de idade) e assim dá pra testar as
 * bordas — virada de dia, folga no meio do expediente, antecedência mínima —
 * sem banco nenhum.
 *
 * Quem decide de fato se o horário está livre é a constraint
 * appointments_sem_sobreposicao no banco. O que está aqui é o que o cliente
 * enxerga; o banco é quem arbitra o empate.
 */

import {
  addDaysToIsoDate,
  isoDateTimeToInstant,
  minutesOfDay,
  parseIsoDate,
  weekdayOfCalendarDate,
} from "@/lib/timezone";

export type Faixa = { starts_at: string; ends_at: string };

export type RegraSemanal = {
  weekday: number;
  starts_at: string;
  ends_at: string;
};

export type ConfiguracaoAgenda = {
  timeZone: string;
  slotIntervalMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  maxDaysAhead: number;
};

export type EntradaDeHorarios = {
  /** Dia no calendário local do prestador: "2026-09-15". */
  isoDate: string;
  duracaoMinutos: number;
  config: ConfiguracaoAgenda;
  regras: RegraSemanal[];
  /** Bloqueios e agendamentos já existentes, em ISO 8601 com fuso. */
  bloqueios: Faixa[];
  ocupados: Faixa[];
  /** Injetado pra o teste poder fixar o relógio. */
  agora: Date;
};

export type Horario = {
  /** Instante de início, em ISO 8601 UTC. */
  inicio: string;
  fim: string;
  /** "09:30", já no fuso do prestador — é o que vai na tela. */
  rotulo: string;
  livre: boolean;
};

const MINUTO = 60_000;

/**
 * Todos os começos possíveis do dia, livres e ocupados.
 *
 * Devolver o ocupado também é de propósito: uma grade que some com o horário
 * preenchido faz o cliente achar que o prestador não trabalha àquela hora.
 * Riscado comunica "existe, mas já foi".
 */
export function gerarHorariosDoDia(entrada: EntradaDeHorarios): Horario[] {
  const { isoDate, duracaoMinutos, config, regras, bloqueios, ocupados, agora } = entrada;
  const { timeZone, slotIntervalMinutes, bufferMinutes, minNoticeMinutes } = config;

  if (duracaoMinutos <= 0 || slotIntervalMinutes <= 0) return [];

  const { year, month, day } = parseIsoDate(isoDate);
  const diaDaSemana = weekdayOfCalendarDate(year, month, day);

  const doDia = regras
    .filter((r) => r.weekday === diaDaSemana)
    .sort((a, b) => minutesOfDay(a.starts_at) - minutesOfDay(b.starts_at));
  if (doDia.length === 0) return [];

  const naoAntesDe = agora.getTime() + minNoticeMinutes * MINUTO;

  // Bloqueio é parede: nem o buffer atravessa. Agendamento existente carrega
  // o buffer nas duas pontas — é o descanso entre um atendimento e o próximo.
  const paredes = bloqueios.map(paraIntervalo);
  const vizinhos = ocupados.map(paraIntervalo).map(({ inicio, fim }) => ({
    inicio: inicio - bufferMinutes * MINUTO,
    fim: fim + bufferMinutes * MINUTO,
  }));

  const horarios: Horario[] = [];
  const jaVistos = new Set<number>();

  for (const regra of doDia) {
    const aberturaMin = minutesOfDay(regra.starts_at);
    const fechamentoMin = minutesOfDay(regra.ends_at);

    for (let m = aberturaMin; m + duracaoMinutos <= fechamentoMin; m += slotIntervalMinutes) {
      // Faixa que cruza a meia-noite não existe (o CHECK do banco garante
      // ends_at > starts_at dentro do mesmo dia), então somar minutos ao dia
      // local nunca escorrega pro dia seguinte aqui.
      const hora = Math.floor(m / 60);
      const minuto = m % 60;
      const inicio = isoDateTimeToInstant(isoDate, `${pad2(hora)}:${pad2(minuto)}`, timeZone);
      const inicioMs = inicio.getTime();

      // Duas regras encostadas no mesmo dia (08:00-12:00 e 12:00-18:00) podem
      // propor o mesmo começo. Uma vez só na grade.
      if (jaVistos.has(inicioMs)) continue;
      jaVistos.add(inicioMs);

      const fimMs = inicioMs + duracaoMinutos * MINUTO;

      const livre =
        inicioMs >= naoAntesDe &&
        !paredes.some((p) => sobrepoe(inicioMs, fimMs, p.inicio, p.fim)) &&
        !vizinhos.some((v) => sobrepoe(inicioMs, fimMs, v.inicio, v.fim));

      horarios.push({
        inicio: new Date(inicioMs).toISOString(),
        fim: new Date(fimMs).toISOString(),
        rotulo: `${pad2(hora)}:${pad2(minuto)}`,
        livre,
      });
    }
  }

  return horarios.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/**
 * Janela que o cliente pode navegar: de hoje até max_days_ahead.
 * Devolve datas locais do prestador — quem está em Lisboa agendando com
 * alguém em São Paulo tem que ver os dias de lá, não os de casa.
 */
export function janelaDeAgendamento(
  config: Pick<ConfiguracaoAgenda, "timeZone" | "maxDaysAhead">,
  agora: Date,
): { primeiroDia: string; ultimoDia: string } {
  const primeiroDia = isoDateNoFuso(agora, config.timeZone);
  return {
    primeiroDia,
    ultimoDia: addDaysToIsoDate(primeiroDia, config.maxDaysAhead),
  };
}

/** Dias da janela em que existe pelo menos uma regra de expediente. */
export function diasComExpediente(
  regras: RegraSemanal[],
  primeiroDia: string,
  ultimoDia: string,
): string[] {
  const abertos = new Set(regras.map((r) => r.weekday));
  if (abertos.size === 0) return [];

  const dias: string[] = [];
  let cursor = primeiroDia;
  // Teto de segurança: max_days_ahead já é limitado a 365 no banco, mas um
  // ultimoDia malformado não pode virar laço infinito no servidor.
  for (let i = 0; i <= 366 && cursor <= ultimoDia; i++) {
    const { year, month, day } = parseIsoDate(cursor);
    if (abertos.has(weekdayOfCalendarDate(year, month, day))) dias.push(cursor);
    cursor = addDaysToIsoDate(cursor, 1);
  }
  return dias;
}

/**
 * Intervalos [início, fim) se cruzam? Meio aberto de propósito: um
 * atendimento que termina 10:00 e outro que começa 10:00 não conflitam —
 * mesma regra do '[)' da constraint no banco.
 */
function sobrepoe(aInicio: number, aFim: number, bInicio: number, bFim: number): boolean {
  return aInicio < bFim && bInicio < aFim;
}

function paraIntervalo(faixa: Faixa): { inicio: number; fim: number } {
  return { inicio: Date.parse(faixa.starts_at), fim: Date.parse(faixa.ends_at) };
}

function isoDateNoFuso(instant: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA já formata como "2026-09-15".
  return dtf.format(instant);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
