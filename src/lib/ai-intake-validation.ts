import { z } from "zod";

/**
 * Schema de arquivo compartilhado pelas duas leituras por IA (compra e
 * venda) -- eram cópias idênticas em cada arquivo, então qualquer ajuste de
 * limite tinha que lembrar de mexer nos dois lugares.
 */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

// ~6MB de arquivo real, já descontando o overhead do base64. 30MB por
// arquivo, vezes até 4 arquivos por chamada, deixava um corpo de requisição
// enorme sem necessidade nenhuma pra uma foto de celular ou um PDF de nota,
// só ampliando o custo de um eventual abuso.
export const MAX_DATA_URL_LENGTH = 8_000_000;
export const MAX_FILES_PER_CALL = 4;

export const fileSchema = z.object({
  name: z.string().max(300),
  mimeType: z.enum(ALLOWED_MIME_TYPES, { message: "Tipo de arquivo não suportado." }),
  // Precisa ser data: URI. O valor vai direto no corpo mandado ao Gemini, e o
  // campo aceitava qualquer string -- inclusive uma URL http, que faria a API
  // do Google buscar o endereco escolhido por quem chamou e devolver o conteudo
  // ja interpretado. Nao e a nossa rede que responde, mas continua sendo a nossa
  // chave buscando o que mandarem.
  dataUrl: z
    .string()
    .max(MAX_DATA_URL_LENGTH, { message: "Arquivo grande demais." })
    .refine((value) => value.startsWith("data:"), { message: "Arquivo inválido." }),
});
