import { z } from "zod";

/**
 * Regras de senha compartilhadas por cadastro, redefinição e login.
 *
 * 12 como mínimo pro cadastro/redefinição -- não tem MFA neste app ainda, e
 * sem MFA o comprimento mínimo recomendado sobe (NIST 800-63B). 72 como
 * máximo porque é o limite real do bcrypt usado por baixo do Supabase Auth
 * -- não adianta aceitar mais aqui, o servidor trunca/rejeita de qualquer
 * jeito. Sem regra de maiúscula/símbolo/número: comprimento importa mais que
 * complexidade forçada, e complexidade forçada correlaciona com senha mais
 * fraca na prática (usuário troca "a" por "@" e chama de seguro).
 */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 72;

// toLowerCase() além do trim(): o Supabase já normaliza case internamente
// pra comparar contas, mas sem isso aqui duas pessoas digitando
// "nome@x.com" e "Nome@X.com" veem tratamento inconsistente na própria UI
// (ex: e-mail ecoado na tela de confirmação) antes mesmo de chegar no
// servidor -- normalizar do lado do cliente também evita depender só do
// comportamento interno de terceiro pra essa garantia.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email({ message: "E-mail inválido" })
  .max(255);

export const newPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, {
    message: `A senha precisa de ao menos ${MIN_PASSWORD_LENGTH} caracteres`,
  })
  .max(MAX_PASSWORD_LENGTH, { message: "Senha longa demais" });

/**
 * Login nunca valida força de senha -- isso é assunto de cadastro/troca. Uma
 * conta antiga pode ter nascido sob uma política de senha mais frouxa que a
 * atual, e apertar o mínimo aqui trancaria ela fora de casa sem aviso.
 */
export const loginPasswordSchema = z
  .string()
  .min(1, { message: "Informe a senha" })
  .max(MAX_PASSWORD_LENGTH);

/**
 * Freio progressivo de login: a partir da 5ª tentativa falha seguida, a
 * próxima só libera depois de um intervalo que dobra (5s, 10s, 20s...).
 * Complementa -- não substitui -- o rate limit do próprio projeto Supabase
 * (Authentication > Rate Limits), que é a barreira de verdade do lado do
 * servidor.
 */
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_BASE_MS = 5000;

/** `null` quando ainda não deve travar; caso contrário, o timestamp (ms) até quando trava. */
export function computeLockoutUntil(failedAttempts: number, now: number): number | null {
  if (failedAttempts < LOCKOUT_THRESHOLD) return null;
  const backoff = LOCKOUT_BASE_MS * 2 ** (failedAttempts - LOCKOUT_THRESHOLD);
  return now + backoff;
}
