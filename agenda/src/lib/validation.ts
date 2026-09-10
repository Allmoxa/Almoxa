/**
 * Schemas compartilhados entre o formulário e a server function.
 *
 * Os dois lados usam o mesmo objeto de propósito: o do navegador é
 * conveniência (mensagem embaixo do campo antes de gastar uma requisição), o
 * do servidor é o que vale. Quem manda POST na mão pula o primeiro inteiro.
 */

import { z } from "zod";
import { isValidTimeZone } from "@/lib/timezone";

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

export const agendarSchema = dadosDoClienteSchema.extend({
  slug: slugSchema,
  serviceId: z.string().uuid({ message: "Serviço inválido" }),
  // Instante de início escolhido, em ISO 8601. O servidor recalcula a grade e
  // confere se este começo está mesmo nela — a lista que o cliente viu pode
  // ter minutos de idade, e a tela não é fonte de verdade.
  inicio: z.string().datetime({ message: "Horário inválido" }),
  // Campo escondido no formulário: só bot preenche. Cheio, a gente finge
  // sucesso e não gasta cota de e-mail com ele.
  website: z.string().max(200).optional(),
});

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
  // A tela pede em reais; o banco guarda em centavos. Vazio vira null, que
  // significa "sob consulta" — diferente de 0, que é gratuito de verdade.
  price_cents: z
    .union([z.coerce.number().min(0).max(99_999_999), z.literal("")])
    .transform((v) => (v === "" ? null : Math.round(Number(v) * 100)))
    .nullable(),
  active: z.boolean().default(true),
});

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

export const configuracaoSchema = z.object({
  display_name: z.string().trim().min(2, { message: "Informe o nome" }).max(120),
  headline: z.string().trim().max(200).optional(),
  slug: slugSchema,
  contact_email: emailSchema.optional().or(z.literal("")),
  phone: telefoneSchema,
  timezone: timezoneSchema,
  slot_interval_minutes: z.coerce.number().int().min(5).max(240),
  min_notice_minutes: z.coerce.number().int().min(0).max(20_160),
  max_days_ahead: z.coerce.number().int().min(1).max(365),
  buffer_minutes: z.coerce.number().int().min(0).max(240),
  reminder_hours: z.coerce.number().int().min(0).max(168),
  accepting: z.boolean(),
});

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
