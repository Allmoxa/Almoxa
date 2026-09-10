/**
 * Decisão de quando o lembrete sai.
 *
 * Mora aqui, fora da rota do cron, porque é a única parte daquele arquivo que
 * erra em silêncio: um lembrete não enviado não deixa rastro, e o resto da rota
 * (segredo, consulta, envio) só falha alto. Função pura, então dá pra testar
 * sem banco nem Resend.
 */

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
