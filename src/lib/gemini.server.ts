/**
 * A chamada ao Gemini, uma vez só.
 *
 * Leitura de compra (intake.functions.ts) e de venda (sale-intake.functions.ts)
 * faziam a mesma requisição, cada uma com sua cópia do endpoint, do modelo e do
 * tratamento de erro. As duas carregavam os mesmos dois defeitos, e consertar
 * num lugar deixaria o outro quebrado do mesmo jeito.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MODELO = "gemini-3.6-flash";

/** Tentativas e folga entre elas. Ver `chamarGemini`. */
const TENTATIVAS = 3;
const ESPERA_MS = [500, 1500];
/**
 * Teto de tempo das tentativas somadas.
 *
 * A função serverless tem limite próprio; estourar ele troca a mensagem que
 * escrevemos por um 504 cru da plataforma, que não diz nada a quem está com o
 * celular na mão esperando a leitura.
 */
const ORCAMENTO_MS = 6_000;

export type ArquivoDeLeitura = { name: string; mimeType: string; dataUrl: string };

/** Erro com mensagem que pode ser mostrada; o resto vira texto genérico. */
export class ErroDeLeitura extends Error {}

/**
 * Monta o conteúdo da mensagem do usuário.
 *
 * Tudo vai como `image_url`, PDF inclusive. O caminho anterior mandava
 * documento como `{ type: "file", file: { file_data } }`, que é o formato da
 * OpenAI — a camada de compatibilidade do Gemini responde a ele com
 * `400 Invalid content part type: file`. Ou seja: nenhuma nota em PDF jamais
 * foi lida, e a tela dizia "tente uma foto mais nítida" para um arquivo que o
 * servidor recusou antes de olhar. Em `image_url` com data URI o mesmo PDF é
 * lido normalmente.
 */
export function conteudoDaLeitura(instrucao: string, arquivos: ArquivoDeLeitura[]): unknown[] {
  const partes: unknown[] = [{ type: "text", text: instrucao }];
  for (const arquivo of arquivos) {
    partes.push({ type: "image_url", image_url: { url: arquivo.dataUrl } });
  }
  return partes;
}

/**
 * Chama o modelo e devolve os argumentos crus da tool call.
 *
 * Repete quando o Gemini responde 5xx. Não é zelo teórico: o modelo devolve
 * `503 high demand` com frequência, e uma única passada transformava sobrecarga
 * momentânea do Google em "não consegui ler este arquivo" — mandando a pessoa
 * refazer uma foto que estava boa. 429 não entra na repetição: ali o pedido é
 * justamente para parar.
 */
export async function chamarGemini(opcoes: {
  apiKey: string;
  systemPrompt: string;
  content: unknown[];
  tool: unknown;
  toolName: string;
  /** Mostrada quando o arquivo chegou mas não deu para ler. */
  erroDeLeitura: string;
}): Promise<string> {
  const corpo = JSON.stringify({
    model: MODELO,
    messages: [
      { role: "system", content: opcoes.systemPrompt },
      { role: "user", content: opcoes.content },
    ],
    tools: [opcoes.tool],
    tool_choice: { type: "function", function: { name: opcoes.toolName } },
  });

  const comecou = Date.now();
  let ultimoStatus = 0;

  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    const resposta = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opcoes.apiKey}`,
        "Content-Type": "application/json",
      },
      body: corpo,
    });

    if (resposta.ok) {
      const payload = (await resposta.json()) as {
        choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
      };
      const bruto = payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!bruto) throw new ErroDeLeitura("Nenhum item foi identificado.");
      return bruto;
    }

    ultimoStatus = resposta.status;
    const detalhe = await resposta.text();
    console.error("Gemini API error", resposta.status, detalhe);

    if (resposta.status === 429) {
      throw new ErroDeLeitura("Muitas leituras seguidas. Tente novamente em instantes.");
    }
    if (resposta.status === 403) {
      throw new ErroDeLeitura("Chave da API do Gemini inválida ou sem permissão.");
    }
    // 4xx é problema do que mandamos: repetir dá o mesmo erro e gasta o tempo
    // de quem espera.
    if (resposta.status < 500) throw new ErroDeLeitura(opcoes.erroDeLeitura);

    const espera = ESPERA_MS[tentativa] ?? 0;
    const ultima = tentativa === TENTATIVAS - 1;
    if (ultima || Date.now() - comecou + espera > ORCAMENTO_MS) break;
    await new Promise((resolve) => setTimeout(resolve, espera));
  }

  // Só chega aqui depois de 5xx em todas as tentativas.
  console.error(
    "Gemini indisponível depois de",
    TENTATIVAS,
    "tentativas; último status",
    ultimoStatus,
  );
  throw new ErroDeLeitura(
    "O serviço de leitura está sobrecarregado agora. Espere um instante e tente de novo — não é a sua foto.",
  );
}
