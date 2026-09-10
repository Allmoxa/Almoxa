import type { Horario } from "@/lib/slots";

/**
 * Grade de horários do dia.
 *
 * Ocupado aparece riscado em vez de sumir: uma grade que esconde o horário
 * cheio faz o cliente concluir que o prestador não atende àquela hora. Ver
 * "14:00" riscado e "14:30" livre conta a história certa em um olhar.
 *
 * O número de colunas sai de um @container no CSS (.slot-grid), não de media
 * query — o que manda é a largura da caixa, que no desktop divide a linha com
 * o resumo lateral.
 */
export function SlotGrid({
  horarios,
  carregando,
  selecionado,
  onSelecionar,
}: {
  horarios: Horario[];
  carregando: boolean;
  selecionado: string | null;
  onSelecionar: (inicio: string) => void;
}) {
  if (carregando) {
    return (
      <div className="slot-grid-container">
        <div className="slot-grid" aria-busy="true" aria-label="Carregando horários">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-slot-shimmer h-11 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (horarios.length === 0) {
    return (
      <p className="paper-panel p-6 text-center text-sm text-muted-foreground">
        Nenhum horário neste dia. Escolha outro na faixa acima.
      </p>
    );
  }

  const livres = horarios.filter((h) => h.livre).length;

  return (
    <div className="slot-grid-container">
      <div className="slot-grid" role="radiogroup" aria-label="Escolha o horário">
        {horarios.map((horario) => {
          const escolhido = selecionado === horario.inicio;
          return (
            <button
              key={horario.inicio}
              type="button"
              role="radio"
              aria-checked={escolhido}
              data-selected={escolhido}
              disabled={!horario.livre}
              onClick={() => onSelecionar(horario.inicio)}
              className="slot-chip"
              // O riscado sozinho não chega no leitor de tela.
              aria-label={horario.livre ? horario.rotulo : `${horario.rotulo} — indisponível`}
            >
              {horario.rotulo}
            </button>
          );
        })}
      </div>

      {livres === 0 ? (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Todos os horários deste dia já foram preenchidos.
        </p>
      ) : null}
    </div>
  );
}
