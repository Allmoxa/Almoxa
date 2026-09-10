/**
 * Schemas compartilhados entre o formulário e a server function.
 *
 * Os dois lados usam o mesmo objeto de propósito: o do navegador é
 * conveniência (mensagem embaixo do campo antes de gastar uma requisição), o
 * do servidor é o que vale. Quem manda POST na mão pula o primeiro inteiro.
 */

import { z } from "zod";
import { isValidTimeZone } from "@/agenda/lib/timezone";

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, { message: "Use pelo menos 3 caracteres" })
  .max(40, { message: "Use no máximo 40 caracteres" })
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/, {
    message: "Só letras minúsculas, números e hífen — sem hífen no começo ou no fim",
  });

export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: "Informe o e-mail" })
  .max(255, { message: "E-mail longo demais" })
  .email({ message: "E-mail inválido" });

/**
 * Telefone é opcional e a validação é frouxa de propósito: serve pro
 * prestador ligar, não pra integrar com gateway. Recusar "(11) 9 8765-4321"
 * por causa do espaço a mais só faria o cliente desistir do agendamento.
 */
export const telefoneSchema = z
  .string()
  .trim()
  .max(30, { message: "Telefone longo demais" })
  .regex(/^[0-9()+\-.\s]*$/, { message: "Use só números, espaço, parênteses, + e -" })
  .optional()
  .or(z.literal(""));

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Data inválida" });

export const horaSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, { message: "Horário inválido" });

export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isValidTimeZone, { message: "Fuso horário desconhecido" });

/** Dados que o cliente preenche na última etapa do agendamento público. */
export const dadosDoClienteSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { message: "Informe seu nome" })
    .max(120, { message: "Nome longo demais" }),
  email: emailSchema,
  telefone: telefoneSchema,
  observacao: z.string().trim().max(500, { message: "No máximo 500 caracteres" }).optional(),
});

export type DadosDoCliente = z.infer<typeof dadosDoClienteSchema>;

/**
 * Campo escondido no formulário: só bot preenche.
 *
 * Fica fora de `dadosDoClienteSchema` porque o zod descarta chave que o schema
 * não declara — e um honeypot descartado na validação do formulário nunca
 * chega ao servidor, que é justamente onde ele decide alguma coisa.
 */
export const honeypotSchema = z.string().max(200).optional();

/** O que o formulário do cliente valida: os dados dele mais o honeypot. */
export const formularioDoClienteSchema = dadosDoClienteSchema.extend({
  website: honeypotSchema,
});

export type FormularioDoCliente = z.infer<typeof formularioDoClienteSchema>;

export const agendarSchema = dadosDoClienteSchema.extend({
  slug: slugSchema,
  serviceId: z.string().uuid({ message: "Serviço inválido" }),
  // Instante de início escolhido, em ISO 8601. O servidor recalcula a grade e
  // confere se este começo está mesmo nela — a lista que o cliente viu pode
  // ter minutos de idade, e a tela não é fonte de verdade.
  inicio: z.string().datetime({ message: "Horário inválido" }),
  // Cheio, a gente finge sucesso e não gasta cota de e-mail com ele.
  website: honeypotSchema,
});

/**
 * Serviço, na forma em que a tela edita.
 *
 * O preço é string porque o campo é livre e brasileiro: "49,90" com vírgula.
 * A conversão pra centavos é `centavosDoPreco`, e só acontece na hora de
 * gravar — guardar número aqui obrigaria o formulário a converter antes de
 * validar, e aí "49,90" viraria NaN antes de qualquer mensagem de erro.
 */
export const servicoSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: "Dê um nome ao serviço" })
    .max(120, { message: "Nome longo demais" }),
  description: z.string().trim().max(600, { message: "No máximo 600 caracteres" }).optional(),
  duration_minutes: z.coerce
    .number()
    .int({ message: "Use minutos inteiros" })
    .min(5, { message: "No mínimo 5 minutos" })
    .max(1440, { message: "No máximo 24 horas" }),
  preco: z
    .string()
    .trim()
    .refine((v) => v === "" || !Number.isNaN(Number(v.replace(",", "."))), {
      message: "Use um número, como 49,90",
    })
    .refine((v) => v === "" || Number(v.replace(",", ".")) >= 0, {
      message: "O preço não pode ser negativo",
    })
    .refine((v) => v === "" || Number(v.replace(",", ".")) <= 999_999, {
      message: "Preço alto demais",
    }),
  active: z.boolean(),
});

export type ServicoEmEdicao = z.input<typeof servicoSchema>;

/**
 * "49,90" → 4990. Vazio vira null, que é "sob consulta" — diferente de 0,
 * que é gratuito de verdade.
 */
export function centavosDoPreco(preco: string): number | null {
  const limpo = preco.trim();
  if (limpo === "") return null;
  return Math.round(Number(limpo.replace(",", ".")) * 100);
}

export const regraSchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    starts_at: horaSchema,
    ends_at: horaSchema,
  })
  .refine((r) => r.ends_at > r.starts_at, {
    message: "O fim tem que ser depois do começo",
    path: ["ends_at"],
  });

export const bloqueioSchema = z
  .object({
    dia: isoDateSchema,
    diaInteiro: z.boolean().default(false),
    starts_at: horaSchema.optional(),
    ends_at: horaSchema.optional(),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((b) => b.diaInteiro || (b.starts_at && b.ends_at), {
    message: "Informe o intervalo ou marque o dia inteiro",
    path: ["starts_at"],
  })
  .refine((b) => b.diaInteiro || !b.starts_at || !b.ends_at || b.ends_at > b.starts_at, {
    message: "O fim tem que ser depois do começo",
    path: ["ends_at"],
  });

/**
 * Como o prestador aparece pro cliente.
 *
 * Editado na tela "Seu link", junto do slug e da chave de aceitar
 * agendamentos: é tudo que o cliente vê antes de escolher um horário.
 */
export const identidadeSchema = z.object({
  display_name: z.string().trim().min(2, { message: "Informe o nome" }).max(120, {
    message: "Nome longo demais",
  }),
  headline: z.string().trim().max(200, { message: "No máximo 200 caracteres" }).optional(),
  contact_email: emailSchema.optional().or(z.literal("")),
  phone: telefoneSchema,
});

export type Identidade = z.input<typeof identidadeSchema>;

/**
 * Régua de agendamento — os números que decidem a grade.
 *
 * Os limites repetem os CHECK da migration de propósito: o banco é quem
 * arbitra, mas errar aqui devolveria um 400 cru do PostgREST em vez de uma
 * mensagem embaixo do campo.
 */
export const reguaSchema = z.object({
  timezone: timezoneSchema,
  slot_interval_minutes: z.coerce
    .number()
    .int({ message: "Use minutos inteiros" })
    .min(5, { message: "No mínimo 5 minutos" })
    .max(240, { message: "No máximo 4 horas" }),
  min_notice_minutes: z.coerce
    .number()
    .int({ message: "Use minutos inteiros" })
    .min(0, { message: "Não pode ser negativo" })
    .max(20_160, { message: "No máximo 14 dias" }),
  max_days_ahead: z.coerce
    .number()
    .int({ message: "Use dias inteiros" })
    .min(1, { message: "No mínimo 1 dia" })
    .max(365, { message: "No máximo 365 dias" }),
  buffer_minutes: z.coerce
    .number()
    .int({ message: "Use minutos inteiros" })
    .min(0, { message: "Não pode ser negativo" })
    .max(240, { message: "No máximo 4 horas" }),
  reminder_hours: z.coerce
    .number()
    .int({ message: "Use horas inteiras" })
    .min(0, { message: "Não pode ser negativo" })
    .max(168, { message: "No máximo 7 dias" }),
});

export type Regua = z.input<typeof reguaSchema>;

/** Reais a partir de centavos: 4990 → "R$ 49,90". null → "Sob consulta". */
export function formatarPreco(centavos: number | null): string {
  if (centavos === null) return "Sob consulta";
  if (centavos === 0) return "Gratuito";
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** 90 → "1h30". Duração curta fica em minutos: 45 → "45 min". */
export function formatarDuracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, "0")}`;
}
