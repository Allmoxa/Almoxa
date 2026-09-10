/**
 * Endereço público da agenda — a raiz de todo link que sai daqui.
 *
 * `.server.ts` e importado dinamicamente de dentro dos handlers, como o
 * email.server: é código que só faz sentido no servidor e não tem por que
 * entrar no bundle do navegador.
 *
 * A ordem de precedência é o assunto deste arquivo:
 *
 *   1. AGENDA_PUBLIC_URL, quando for um endereço de verdade. É o domínio
 *      próprio, e é o que torna a URL inteiramente personalizável.
 *   2. o domínio de produção do projeto na Vercel (almoxa.vercel.app), que a
 *      plataforma informa sozinha. É o padrão certo: funciona sem ninguém
 *      cadastrar nada, e continua valendo quando o código roda num deploy de
 *      branch — que tem endereço próprio, mas endereço que ninguém deve
 *      receber por e-mail nem colar no WhatsApp.
 *   3. o endereço deste deploy específico, pra pré-visualização isolada.
 *   4. localhost, em desenvolvimento.
 *
 * O passo 1 recusa o que não for URL. O modelo do .env traz um valor de
 * exemplo, e ele já foi parar em produção uma vez: os e-mails saíram apontando
 * para "https://<seu-dominio>/agendamento/…", que não abre em lugar nenhum.
 * Recusar e cair no passo 2 é melhor do que obedecer a um endereço impossível.
 *
 * O que não entra na lista, de propósito, é o cabeçalho `Host` da requisição.
 * Ele é escolhido por quem chama, e um `Host` forjado faria o e-mail legítimo
 * da agenda chegar ao cliente com um link apontando pra outro lugar.
 */

/** De onde saiu a raiz — a tela do prestador usa isto pra saber o que dizer. */
export type OrigemDaBase = "configurada" | "producao" | "deploy" | "local";

export type BasePublica = {
  base: string;
  origem: OrigemDaBase;
  /** O que veio em AGENDA_PUBLIC_URL e foi descartado por não ser um endereço. */
  recusada: string | null;
};

let jaAvisou = false;

export function basePublica(): BasePublica {
  const bruta = process.env["AGENDA_PUBLIC_URL"]?.trim() ?? "";
  const configurada = normalizarBase(bruta);
  const recusada = bruta !== "" && configurada === null ? bruta : null;

  if (recusada && !jaAvisou) {
    jaAvisou = true;
    console.error(
      `[agenda] AGENDA_PUBLIC_URL não é um endereço válido: ${JSON.stringify(bruta)}. ` +
        "Ignorada. Cadastre o domínio real (ex.: https://almoxa.vercel.app) nas " +
        "variáveis de ambiente do deploy.",
    );
  }

  if (configurada) return { base: configurada, origem: "configurada", recusada };

  // Posta pela Vercel em todo deploy, inclusive nos de branch: é o domínio de
  // produção do projeto, não o desta build.
  const producao = normalizarBase(process.env["VERCEL_PROJECT_PRODUCTION_URL"] ?? "");
  if (producao) return { base: producao, origem: "producao", recusada };

  const deploy = normalizarBase(process.env["VERCEL_URL"] ?? "");
  if (deploy) return { base: deploy, origem: "deploy", recusada };

  return { base: "http://localhost:8081", origem: "local", recusada };
}

export function urlPublica(): string {
  return basePublica().base;
}

/** Link que o cliente usa pra ver ou desmarcar um agendamento. */
export function linkDeGestao(manageToken: string): string {
  return `${urlPublica()}/agendamento/${manageToken}`;
}

/**
 * Devolve "https://dominio" a partir do que veio, ou null se não for endereço.
 *
 * Aceita sem protocolo porque é assim que a Vercel entrega as dela
 * (`almoxa.vercel.app`) e é assim que a pessoa digita quando cadastra na mão.
 */
function normalizarBase(valor: string): string | null {
  const bruto = valor.trim().replace(/\/+$/, "");
  if (bruto === "") return null;
  // Endereço não tem espaço no meio. Quem tem é frase — "não é url", "SEU
  // DOMINIO AQUI" — e o construtor de URL engoliria isso virando caminho.
  if (/\s/.test(bruto)) return null;

  const comProtocolo = /^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`;

  let url: URL;
  try {
    url = new URL(comProtocolo);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // "<seu-dominio>", "SEU_DOMINIO_AQUI" e parentes: placeholder do modelo.
  if (/[<>_\s]/.test(url.hostname)) return null;
  // Domínio sem ponto não existe fora da máquina de quem desenvolve.
  if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;

  // O caminho sobrevive: quem serve a agenda sob "/agenda" configurou isso de
  // propósito, e descartar em silêncio quebraria todo link com um erro que só
  // aparece na caixa de entrada de outra pessoa.
  const caminho = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host}${caminho}`;
}
