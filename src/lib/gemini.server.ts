/**
 * A chamada ao Gemini, uma vez só.
 *
 * Leitura de compra (intake.functions.ts) e de venda (sale-intake.functions.ts)
 * faziam a mesma requisição, cada uma com sua cópia do endpoint, do modelo e do
 * tratamento de erro. As duas carregavam os mesmos dois defeitos, e consertar
 * num lugar deixaria o outro quebrado do mesmo jeito.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

/**
 * Modelos tentados em ordem, até um responder, cada um com seu prazo.
 *
 * A ordem saiu de medição, não de preferência. Mesmo documento, mesma
 * ferramenta de extração, duas rodadas de três chamadas:
 *
 *   gemini-3.6-flash          0 de 6 — e o 503 levava de 13 a 56 s pra voltar
 *   gemini-3-flash-preview    2 de 6
 *   gemini-3.5-flash-lite     5 de 6
 *   gemini-flash-lite-latest  5 de 6
 *   gemini-2.5-flash(-lite)   404: não existe mais pra esta chave
 *
 * A faixa "flash" grande está saturada e falha devagar: insistir nela é o pior
 * dos mundos, porque gasta o tempo de quem espera pra chegar no mesmo lugar. Os
 * "lite" leram o documento com precisão idêntica — quantidade e preço corretos
 * nos dois itens. Primeiro o lite fixado, que é previsível; depois o apelido
 * "latest", que acompanha o lite atual do Google e sobrevive à aposentadoria do
 * primeiro; e o flash no fim, como aposta de longo tiro pro dia em que ele
 * voltar e o lite estiver fora.
 *
 * Os prazos crescem ao longo da fila, e isso também vem da medição: a latência
 * desta API é de dois tipos, não de uma média. Seis chamadas ao mesmo
 * documento, ou respondiam em 1,3–1,7 s, ou em 23–30 s. Não há meio-termo — é
 * fila livre contra fila cheia. Daí o primeiro ter o prazo mais curto: no modo
 * rápido ele responde muito antes dos 8 s, e se estourar é porque entrou na
 * fila, quando vale mais trocar de fila do que esperar nela. Numa das medições
 * foi exatamente isso: o primeiro engasgou e o segundo respondeu em 3 s.
 *
 * A soma dos três (53 s) cabe no maxDuration de 60 s que o vite.config declara
 * pra função. Estourar aquele limite troca a mensagem que escrevemos por um 504
 * cru da plataforma, que não diz nada a quem está com o celular na mão.
 *
 * Mexer na ordem, nos prazos ou nos modelos é mexer nesta lista e em mais nada.
 * Se aparecer documento difícil que o lite erre — foto torta, nota amassada,
 * muitos itens —, o caminho é pôr um modelo maior na frente e aceitar a espera.
 */
const MODELOS = [
  { nome: "gemini-3.5-flash-lite", timeoutMs: 8_000 },
  { nome: "gemini-flash-lite-latest", timeoutMs: 25_000 },
  { nome: "gemini-3.6-flash", timeoutMs: 20_000 },
] as const;

const ORCAMENTO_MS = 55_000;

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
 * Chama o Gemini e devolve os argumentos crus da tool call.
 *
 * Cai pro próximo modelo da lista quando o atual responde 5xx ou demora demais.
 * Não é zelo teórico: a faixa flash devolve `503 high demand` o tempo todo, e
 * uma única passada transformava sobrecarga do Google em "não consegui ler este
 * arquivo" — mandando a pessoa refazer uma foto que estava boa.
 *
 * Trocar de modelo em vez de repetir o mesmo é deliberado: o 503 desta API não
 * é passageiro por segundo, é a fila daquele modelo. Insistir nele custa
 * dezenas de segundos pra chegar no mesmo 503.
 *
 * 429 e 403 não entram nisso: o primeiro é pedido explícito pra parar, e o
 * segundo é a chave — nenhum outro modelo resolveria.
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
  const comecou = Date.now();
  const falhas: string[] = [];

  for (const modelo of MODELOS) {
    // O que sobra do orçamento manda na coleira: perto do fim, esperar o
    // prazo cheio do modelo seria pedir o 504 da plataforma no lugar da nossa
    // mensagem.
    const restante = ORCAMENTO_MS - (Date.now() - comecou);
    const prazo = Math.min(modelo.timeoutMs, restante);
    if (prazo < 2_000) break;

    const corpo = JSON.stringify({
      model: modelo.nome,
      messages: [
        { role: "system", content: opcoes.systemPrompt },
        { role: "user", content: opcoes.content },
      ],
      tools: [opcoes.tool],
      tool_choice: { type: "function", function: { name: opcoes.toolName } },
    });

    let resposta: Response;
    try {
      resposta = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opcoes.apiKey}`,
          "Content-Type": "application/json",
        },
        body: corpo,
        signal: AbortSignal.timeout(prazo),
      });
    } catch (erro) {
      // Estouro do tempo ou rede fora: o próximo modelo é outra fila, e pode
      // estar livre.
      falhas.push(`${modelo.nome}: ${erro instanceof Error ? erro.name : "falha de rede"}`);
      continue;
    }

    if (resposta.ok) {
      const payload = (await resposta.json()) as {
        choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
      };
      const bruto = payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      // Sem tool call não adianta tentar outro modelo: a requisição foi aceita
      // e respondida, o material é que não tinha produto nenhum.
      if (!bruto) throw new ErroDeLeitura("Nenhum item foi identificado.");
      if (falhas.length > 0) {
        console.info("[gemini] leitura concluída em", modelo.nome, "depois de", falhas.join("; "));
      }
      return bruto;
    }

    const detalhe = await resposta.text();
    console.error("[gemini]", modelo.nome, resposta.status, detalhe.slice(0, 300));

    if (resposta.status === 429) {
      throw new ErroDeLeitura("Muitas leituras seguidas. Tente novamente em instantes.");
    }
    if (resposta.status === 403) {
      throw new ErroDeLeitura("Chave da API do Gemini inválida ou sem permissão.");
    }
    // 4xx é problema do que mandamos: outro modelo daria o mesmo erro.
    if (resposta.status < 500) throw new ErroDeLeitura(opcoes.erroDeLeitura);

    falhas.push(`${modelo.nome}: ${resposta.status}`);
  }

  console.error("[gemini] nenhum modelo respondeu —", falhas.join("; "));
  throw new ErroDeLeitura(
    "O serviço de leitura está sobrecarregado agora. Espere um instante e tente de novo — não é a sua foto.",
  );
}
