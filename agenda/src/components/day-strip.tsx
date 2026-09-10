import { useEffect, useRef } from "react";
import { diaRelativo, partesDoDia } from "@/lib/formato";

/**
 * Faixa de dias disponíveis.
 *
 * Rolagem horizontal com scroll-snap em vez de um calendário de mês: no
 * celular, "próximos dias que dá pra marcar" é a pergunta real, e uma grade
 * 7x5 gasta meia tela pra mostrar quadradinhos vazios de dias fechados. Só os
 * dias que têm expediente entram na lista.
 */
export function DayStrip({
  dias,
  hoje,
  selecionado,
  onSelecionar,
}: {
  dias: string[];
  hoje: string;
  selecionado: string | null;
  onSelecionar: (isoDate: string) => void;
}) {
  const faixaRef = useRef<HTMLDivElement>(null);
  const selecionadoRef = useRef<HTMLButtonElement>(null);

  // Voltar de outra etapa com um dia já escolhido lá no fim da faixa deixaria
  // a seleção fora de vista. `nearest` não mexe se já estiver visível.
  useEffect(() => {
    if (!selecionado || !selecionadoRef.current) return;
    selecionadoRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selecionado]);

  if (dias.length === 0) {
    return (
      <p className="paper-panel p-6 text-center text-sm text-muted-foreground">
        Não há dias abertos para agendamento no momento.
      </p>
    );
  }

  return (
    <div ref={faixaRef} className="day-strip" role="radiogroup" aria-label="Escolha o dia">
      {dias.map((dia) => {
        const { diaDaSemana, numero, mes } = partesDoDia(dia);
        const relativo = diaRelativo(dia, hoje);
        const escolhido = selecionado === dia;

        return (
          <button
            key={dia}
            ref={escolhido ? selecionadoRef : undefined}
            type="button"
            role="radio"
            aria-checked={escolhido}
            data-selected={escolhido}
            onClick={() => onSelecionar(dia)}
            className="day-chip flex flex-col items-center justify-center px-3 py-2"
          >
            <span className="text-[0.625rem] uppercase tracking-wider opacity-70">
              {relativo ?? diaDaSemana}
            </span>
            <span className="mt-0.5 font-mono text-lg leading-none">{numero}</span>
            <span className="mt-0.5 text-[0.625rem] uppercase tracking-wider opacity-70">
              {mes}
            </span>
          </button>
        );
      })}
    </div>
  );
}
