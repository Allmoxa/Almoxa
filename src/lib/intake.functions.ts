import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const fileSchema = z.object({
  name: z.string().max(300),
  mimeType: z.string().max(120),
  dataUrl: z.string().max(30_000_000),
});

const inputSchema = z.object({
  files: z.array(fileSchema).min(1).max(4),
  mode: z.enum(["photo", "document"]),
});

export type ExtractedItem = {
  name: string;
  sku: string;
  quantity: number;
  purchase_price: number;
  sale_price: number;
  note: string;
};

const extractionTool = {
  type: "function" as const,
  function: {
    name: "registrar_produtos",
    description: "Registra os produtos identificados na imagem ou documento de compra.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nome do produto" },
              sku: { type: "string", description: "Código/SKU/EAN. Vazio se não houver." },
              quantity: { type: "number", description: "Quantidade comprada. 1 se não informado." },
              purchase_price: { type: "number", description: "Preço unitário de compra em reais. 0 se não informado." },
              sale_price: { type: "number", description: "Preço unitário de venda em reais. 0 se não informado." },
              note: { type: "string", description: "Fornecedor, unidade ou detalhe curto relevante." },
            },
            required: ["name", "sku", "quantity", "purchase_price", "sale_price", "note"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `Você é um assistente de estoque brasileiro. Extraia os produtos com máxima precisão.
Regras:
- Valores monetários em número decimal (ex: 12.5), sem símbolo nem separador de milhar.
- Se o documento tiver preço total de um item, divida pela quantidade para obter o preço unitário de compra.
- Nunca invente preço de venda: se não estiver no material, use 0.
- Se não houver código, deixe sku vazio.
- Sempre chame a ferramenta registrar_produtos, mesmo que encontre um único produto.`;

export const extractProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<{ items: ExtractedItem[] }> => {
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) throw new Error("Serviço de leitura indisponível.");

    const instruction =
      data.mode === "photo"
        ? "Esta é uma foto de produto(s) ou de uma etiqueta. Identifique o produto, código e quantidade visível."
        : "Este é um documento de compra (nota fiscal, pedido ou recibo). Liste todos os itens comprados.";

    const content: unknown[] = [{ type: "text", text: instruction }];
    for (const file of data.files) {
      if (file.mimeType.startsWith("image/")) {
        content.push({ type: "image_url", image_url: { url: file.dataUrl } });
      } else {
        content.push({
          type: "file",
          file: { filename: file.name, file_data: file.dataUrl },
        });
      }
    }

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-3.6-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
        tools: [extractionTool],
        tool_choice: { type: "function", function: { name: "registrar_produtos" } },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Gemini API error", response.status, detail);
      if (response.status === 429) throw new Error("Muitas leituras seguidas. Tente novamente em instantes.");
      if (response.status === 403) throw new Error("Chave da API do Gemini inválida ou sem permissão.");
      throw new Error("Não consegui ler este arquivo. Tente uma foto mais nítida.");
    }

    const payload = (await response.json()) as {
      choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
    };
    const raw = payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!raw) throw new Error("Nenhum produto foi identificado.");

    const parsed = z
      .object({
        items: z.array(
          z.object({
            name: z.string().default(""),
            sku: z.string().default(""),
            quantity: z.coerce.number().default(1),
            purchase_price: z.coerce.number().default(0),
            sale_price: z.coerce.number().default(0),
            note: z.string().default(""),
          }),
        ),
      })
      .safeParse(JSON.parse(raw));

    if (!parsed.success) throw new Error("A leitura veio incompleta. Tente novamente.");

    const items = parsed.data.items
      .filter((item) => item.name.trim().length > 0)
      .slice(0, 60)
      .map((item) => ({
        name: item.name.trim().slice(0, 200),
        sku: item.sku.trim().slice(0, 80),
        quantity: item.quantity > 0 ? Number(item.quantity.toFixed(3)) : 1,
        purchase_price: Math.max(0, Number(item.purchase_price.toFixed(2))),
        sale_price: Math.max(0, Number(item.sale_price.toFixed(2))),
        note: item.note.trim().slice(0, 200),
      }));

    if (items.length === 0) throw new Error("Nenhum produto foi identificado.");
    return { items };
  });
