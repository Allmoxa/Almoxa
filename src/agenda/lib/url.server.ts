/**
 * Endereço público da agenda — a raiz dos links que saem por e-mail.
 *
 * `.server.ts` e importado dinamicamente de dentro dos handlers, como o
 * email.server: é código que só faz sentido no servidor e não tem por que
 * entrar no bundle do navegador.
 *
 * O fallback é localhost de propósito, e não o domínio da requisição. Derivar
 * do cabeçalho `Host` deixaria o link do e-mail sob controle de quem manda a
 * requisição: bastaria confirmar um agendamento com um `Host` forjado pra que
 * o cliente recebesse, no e-mail legítimo da agenda, um link apontando pra
 * outro lugar. Melhor um link obviamente quebrado em desenvolvimento — com o
 * log abaixo dizendo o que fazer — do que um link plausível e alheio em
 * produção.
 */

let jaAvisou = false;

export function urlPublica(): string {
  const configurada = process.env["AGENDA_PUBLIC_URL"]?.trim();
  if (configurada) return configurada.replace(/\/+$/, "");

  // Uma vez por processo: o aviso serve pra aparecer no log do deploy, não
  // pra repetir a cada agendamento.
  if (!jaAvisou) {
    jaAvisou = true;
    console.error(
      "[agenda] AGENDA_PUBLIC_URL não configurada. Todo link de confirmação, " +
        "lembrete e cancelamento vai apontar pra http://localhost:8081 — " +
        "inútil pra quem receber o e-mail. Cadastre o domínio real nas " +
        "variáveis de ambiente (Vercel: Settings > Environment Variables).",
    );
  }
  return "http://localhost:8081";
}

/** Link que o cliente usa pra ver ou desmarcar um agendamento. */
export function linkDeGestao(manageToken: string): string {
  return `${urlPublica()}/agendamento/${manageToken}`;
}
