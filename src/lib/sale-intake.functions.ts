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
});

export type ExtractedSaleItem = {
  name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  note: string;
};

export type ExtractedSale = {
  items: ExtractedSaleItem[];
  /** Total da notinha. Zero quando o documento não traz um total fechado. */
  total: number;
};

const extractionTool = {
  type: "function" as const,
  function: {
    name: "registrar_venda",
    description: "Registra os itens vendidos identificados na notinha de venda.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nome do produto vendido" },
              sku: { type: "string", description: "Código/SKU/EAN. Vazio se não houver." },
              quantity: { type: "number", description: "Quantidade vendida. 1 se não informado." },
              unit_price: {
                type: "number",
                description: "Preço unitário de venda em reais. 0 se a notinha só trouxer o total.",
              },
              note: { type: "string", description: "Cliente, forma de pagamento ou detalhe curto." },
            },
            required: ["name", "sku", "quantity", "unit_price", "note"],
            additionalProperties: false,
          },
        },
        total: {
          type: "number",
          description: "Valor total da venda em reais. 0 se não estiver escrito na notinha.",
        },
      },
      required: ["items", "total"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `Você é um assistente de estoque brasileiro. Esta é uma notinha de VENDA.
Regras:
- Valores monetários em número decimal (ex: 12.5), sem símbolo nem separador de milhar.
- Se a linha trouxer só o valor total do item, divida pela quantidade para obter o unitário.
- Se a notinha trouxer apenas o total geral, deixe unit_price em 0 e preencha total.
- O campo total é o valor final cobrado do cliente, já com desconto se houver.
- Se não houver código, deixe sku vazio.
- Sempre chame a ferramenta registrar_venda, mesmo com um único item.`;

export const extractSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<ExtractedSale> => {
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) throw new Error("Serviço de leitura indisponível.");

    const content: unknown[] = [
      {
        type: "text",
        text: "Esta é uma notinha, cupom ou recibo de venda. Liste todos os itens vendidos e o total cobrado.",
      },
    ];
    for (const file of data.files) {
      if (file.mimeType.startsWith("image/")) {
        content.push({ type: "image_url", image_url: { url: file.dataUrl } });
      } else {
        content.push({ type: "file", file: { filename: file.name, file_data: file.dataUrl } });
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
        tool_choice: { type: "function", function: { name: "registrar_venda" } },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Gemini API error", response.status, detail);
      if (response.status === 429) throw new Error("Muitas leituras seguidas. Tente novamente em instantes.");
      if (response.status === 403) throw new Error("Chave da API do Gemini inválida ou sem permissão.");
      throw new Error("Não consegui ler esta notinha. Tente uma foto mais nítida.");
    }

    const payload = (await response.json()) as {
      choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
    };
    const raw = payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!raw) throw new Error("Nenhum item foi identificado.");

    const parsed = z
      .object({
        items: z.array(
          z.object({
            name: z.string().default(""),
            sku: z.string().default(""),
            quantity: z.coerce.number().default(1),
            unit_price: z.coerce.number().default(0),
            note: z.string().default(""),
          }),
        ),
        total: z.coerce.number().default(0),
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
        unit_price: Math.max(0, Number(item.unit_price.toFixed(2))),
        note: item.note.trim().slice(0, 200),
      }));

    if (items.length === 0) throw new Error("Nenhum item foi identificado.");
    return { items, total: Math.max(0, Number(parsed.data.total.toFixed(2))) };
  });
