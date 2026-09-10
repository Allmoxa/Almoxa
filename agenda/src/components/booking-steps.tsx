import { ChevronLeft } from "lucide-react";

export const ETAPAS = ["Serviço", "Dia", "Horário", "Seus dados"] as const;
export type Etapa = 0 | 1 | 2 | 3;

/**
 * Cabeçalho das etapas do agendamento.
 *
 * No celular só o nome da etapa atual aparece — quatro rótulos lado a lado
 * numa tela de 360px viram texto de 9px ilegível. O trilho de progresso
 * carrega a informação de "onde estou" nos dois tamanhos; a lista escrita é
 * um reforço que só o desktop tem espaço pra mostrar.
 */
export function BookingSteps({
  etapa,
  onVoltar,
}: {
  etapa: Etapa;
  onVoltar?: (() => void) | undefined;
}) {
  const progresso = (etapa + 1) / ETAPAS.length;

  return (
    <div>
      <div className="flex items-center gap-3">
        {onVoltar ? (
          <button
            type="button"
            onClick={onVoltar}
            className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Voltar para a etapa anterior"
          >
            <ChevronLeft className="size-5" />
          </button>
        ) : null}

        <p className="label-caps">
          Etapa {etapa + 1} de {ETAPAS.length}
        </p>

        <ol className="ml-auto hidden items-center gap-2 sm:flex" aria-hidden="true">
          {ETAPAS.map((nome, i) => (
            <li
              key={nome}
              className={
                i === etapa
                  ? "text-xs font-medium text-foreground"
                  : "text-xs text-muted-foreground/60"
              }
            >
              {nome}
              {i < ETAPAS.length - 1 ? <span className="ml-2 text-border">·</span> : null}
            </li>
          ))}
        </ol>
      </div>

      {/* A largura da barra vem de --step-progress; ver .step-rail no styles.css. */}
      <div
        className="step-rail mt-3"
        style={{ "--step-progress": progresso } as React.CSSProperties}
        role="progressbar"
        aria-valuenow={etapa + 1}
        aria-valuemin={1}
        aria-valuemax={ETAPAS.length}
        aria-label={`Etapa ${etapa + 1} de ${ETAPAS.length}: ${ETAPAS[etapa]}`}
      />
    </div>
  );
}
