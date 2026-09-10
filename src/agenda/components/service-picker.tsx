import { Clock } from "lucide-react";
import type { ServicoPublico } from "@/agenda/lib/booking.functions";
import { formatarDuracao, formatarPreco } from "@/agenda/lib/validation";

/**
 * Escolha do serviço.
 *
 * São rádios de verdade, não <div onClick>. O rótulo inteiro é clicável (área
 * de toque grande de graça), setas do teclado navegam entre as opções sem
 * nenhum onKeyDown, e leitor de tela anuncia "1 de 3 selecionado". O visual
 * de selecionado sai do :has(input:checked) no CSS — o estado do React não
 * precisa ser espelhado numa classe.
 */
export function ServicePicker({
  servicos,
  selecionado,
  onSelecionar,
}: {
  servicos: ServicoPublico[];
  selecionado: string | null;
  onSelecionar: (id: string) => void;
}) {
  if (servicos.length === 0) {
    return (
      <p className="paper-panel p-6 text-center text-sm text-muted-foreground">
        Este prestador ainda não publicou nenhum serviço.
      </p>
    );
  }

  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="sr-only">Escolha o serviço</legend>

      {servicos.map((servico, i) => (
        <label
          key={servico.id}
          className="service-card animate-card-rise p-4"
          style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}
        >
          <input
            type="radio"
            name="servico"
            value={servico.id}
            checked={selecionado === servico.id}
            onChange={() => onSelecionar(servico.id)}
            className="sr-only"
          />

          <div className="flex items-start justify-between gap-3">
            <span className="text-base font-medium">{servico.name}</span>
            <span className="shrink-0 font-mono text-sm">{formatarPreco(servico.price_cents)}</span>
          </div>

          {servico.description ? (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {servico.description}
            </p>
          ) : null}

          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            {formatarDuracao(servico.duration_minutes)}
          </p>
        </label>
      ))}
    </fieldset>
  );
}
