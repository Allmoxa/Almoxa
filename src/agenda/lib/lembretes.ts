/**
 * Decisão de quando o lembrete sai, e de como ele se refere ao horário.
 *
 * Mora aqui, fora da rota do cron, porque é a única parte daquele arquivo que
 * erra em silêncio: um lembrete não enviado não deixa rastro, e o resto da rota
 * (segredo, consulta, envio) só falha alto. Função pura, então dá pra testar
 * sem banco nem Resend.
 */

import { addDaysToIsoDate, instantToIsoDate, parseIsoDate } from "@/agenda/lib/timezone";

/**
 * Vale enviar o lembrete deste agendamento agora?
 *
 * O lembrete vence em `starts_at - janela`. Deixar pra depois só é seguro se
 * essa hora ainda não tiver chegado na próxima vez que o cron rodar — daí a
 * soma do intervalo.
 *
 * Comparar só `faltam <= janela`, sem a soma, funciona com cron de minutos e
 * perde lembrete com cron diário: um horário hoje às 14h com antecedência de
 * 2h seria pulado por estar "longe", e na passada de amanhã já teria passado.
 *
 * O preço da soma é sair adiantado no outro extremo — com cron diário, um
 * horário de depois de amanhã pode ser avisado hoje. Adiantado é chato;
 * atrasado é inútil.
 *
 * @param faltamMs quanto falta para o agendamento começar
 * @param antecedenciaHoras `reminder_hours` do prestador; 0 desliga
 * @param intervaloDoCronMinutos de quanto em quanto tempo o cron roda
 */
export function deveEnviarAgora(
  faltamMs: number,
  antecedenciaHoras: number,
  intervaloDoCronMinutos: number,
): boolean {
  // Antecedência zero é o prestador desligando o lembrete, não "avise na hora".
  if (antecedenciaHoras <= 0) return false;
  // Já começou (ou passou): lembrar agora não serve pra nada.
  if (faltamMs <= 0) return false;

  const janela = antecedenciaHoras * 60 * 60 * 1000;
  const proximaPassada = intervaloDoCronMinutos * 60 * 1000;
  return faltamMs <= janela + proximaPassada;
}

/**
 * Teto da consulta: até onde vale a pena buscar agendamentos.
 *
 * Tem de acompanhar a soma de `deveEnviarAgora`, senão o prestador com a
 * antecedência no teto do banco (168h) teria os lembretes cortados pela
 * consulta antes de a regra sequer rodar.
 */
export function tetoDaConsultaMs(intervaloDoCronMinutos: number): number {
  const TETO_DE_ANTECEDENCIA_HORAS = 168; // CHECK da migration
  return (TETO_DE_ANTECEDENCIA_HORAS * 60 + intervaloDoCronMinutos) * 60 * 1000;
}

/**
 * Como o e-mail se refere ao horário: "amanhã", "em cerca de 3h", "em 2 dias".
 *
 * Sai do tempo que falta de verdade, não do `reminder_hours` do prestador. Os
 * dois divergem porque `deveEnviarAgora` adianta o envio pra caber no
 * intervalo do cron: com cron diário e antecedência de 24h, um agendamento a
 * 47h de distância é avisado hoje. Dizer "amanhã" ali seria simplesmente
 * mentira, e mandar a pessoa no dia errado é pior do que não lembrar.
 *
 * A conta é em dia de calendário do prestador, não em múltiplo de 24h: às 23h
 * de segunda, um horário às 08h de terça está a 9 horas — mas é "amanhã", e é
 * assim que quem lê pensa.
 */
export function textoDeAntecedencia(inicio: Date, agora: Date, timeZone: string): string {
  const hoje = instantToIsoDate(agora, timeZone);
  const dia = instantToIsoDate(inicio, timeZone);

  if (dia === hoje) {
    const horas = Math.round((inicio.getTime() - agora.getTime()) / 3_600_000);
    return horas <= 1 ? "daqui a pouco" : `em cerca de ${horas}h`;
  }
  if (dia === addDaysToIsoDate(hoje, 1)) return "amanhã";

  const dias = diasEntreIsoDates(hoje, dia);
  return `em ${dias} dias`;
}

function diasEntreIsoDates(de: string, ate: string): number {
  const a = parseIsoDate(de);
  const b = parseIsoDate(ate);
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}
