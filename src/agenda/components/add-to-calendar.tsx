import { CalendarPlus, Download } from "lucide-react";
import { useCallback } from "react";
import { montarEventoUnico, paraDataIcs, type EventoIcs } from "@/agenda/lib/ics";

/**
 * "Põe no meu calendário" pro cliente, que não tem login nem conta aqui.
 *
 * Duas saídas, porque nenhuma sozinha cobre todo mundo:
 *
 *   o .ics é universal — no iPhone abre a folha do Calendário, no Android o
 *   seletor de app, no desktop o cliente de e-mail padrão;
 *   o link do Google Agenda é o caminho curto pra quem vive no Gmail e não
 *   quer baixar arquivo nenhum.
 *
 * O arquivo é montado no navegador, via Blob. Um `href="data:text/calendar"`
 * seria mais curto, mas navegador moderno bloqueia navegação de topo pra
 * data: — e é justamente isso que um toque no link faz no celular.
 */
export function AddToCalendar({
  uid,
  titulo,
  descricao,
  inicio,
  fim,
  url,
}: {
  uid: string;
  titulo: string;
  descricao?: string | undefined;
  inicio: Date;
  fim: Date;
  url?: string | undefined;
}) {
  const baixarIcs = useCallback(() => {
    const evento: EventoIcs = {
      uid,
      titulo,
      descricao,
      inicio,
      fim,
      url,
      atualizadoEm: new Date(),
      alarmeMinutosAntes: 60,
    };

    const blob = new Blob([montarEventoUnico(evento)], {
      type: "text/calendar;charset=utf-8",
    });
    const href = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = href;
    link.download = "agendamento.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Sem o revoke, o Blob fica preso na memória da aba até ela fechar. O
    // atraso dá tempo de o navegador começar o download antes de a URL sumir.
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  }, [uid, titulo, descricao, inicio, fim, url]);

  const linkDoGoogle = new URL("https://calendar.google.com/calendar/render");
  linkDoGoogle.searchParams.set("action", "TEMPLATE");
  linkDoGoogle.searchParams.set("text", titulo);
  linkDoGoogle.searchParams.set("dates", `${paraDataIcs(inicio)}/${paraDataIcs(fim)}`);
  if (descricao) linkDoGoogle.searchParams.set("details", descricao);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <button
        type="button"
        onClick={baixarIcs}
        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-border-strong bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Download className="size-4" />
        Salvar no calendário
      </button>

      <a
        href={linkDoGoogle.toString()}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-border-strong bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CalendarPlus className="size-4" />
        Google Agenda
      </a>
    </div>
  );
}
