import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FILTER_FIELD_CLASS } from "@/components/dashboard-filter-bar";
import type { DashboardFilters, MovementTypeFilter, SortBy, ValueType } from "@/lib/dashboard-filters";

const MOVEMENT_OPTIONS: { value: MovementTypeFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "in", label: "Apenas entradas" },
  { value: "out", label: "Apenas saídas" },
];

const INACTIVE_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "Todos" },
  { value: "15", label: "Sem saída há 15 dias" },
  { value: "30", label: "Sem saída há 30 dias" },
  { value: "60", label: "Sem saída há 60 dias" },
  { value: "90", label: "Sem saída há 90 dias" },
];

const VALUE_TYPE_OPTIONS: { value: ValueType; label: string }[] = [
  { value: "cost", label: "Custo" },
  { value: "sale", label: "Preço de venda" },
  { value: "profit", label: "Lucro" },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "default", label: "Padrão" },
  { value: "topSelling", label: "Mais vendidos" },
  { value: "leastSelling", label: "Menos vendidos" },
  { value: "mostProfit", label: "Maior lucro" },
  { value: "leastProfit", label: "Menor lucro" },
  { value: "mostStock", label: "Maior estoque" },
  { value: "leastStock", label: "Menor estoque" },
  { value: "name", label: "Nome em ordem alfabética" },
];

/**
 * Painel lateral dos filtros avançados. Tem estado próprio (rascunho) que só
 * vira o estado real do dashboard ao clicar "Aplicar filtros" — mudar um
 * select aqui dentro não deve atualizar cards/gráficos a cada clique.
 */
export function DashboardAdvancedFilters({
  open,
  onOpenChange,
  filters,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: DashboardFilters;
  onApply: (next: DashboardFilters) => void;
}) {
  const [draft, setDraft] = useState(filters);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  const apply = () => {
    // Faixa de valor: nunca deixa o mínimo maior que o máximo — troca em vez de bloquear.
    let next = draft;
    if (next.minValue != null && next.maxValue != null && next.minValue > next.maxValue) {
      next = { ...next, minValue: next.maxValue, maxValue: next.minValue };
    }
    onApply(next);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        id="dashboard-advanced-filters-panel"
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-sm"
      >
        <SheetHeader>
          <SheetTitle>Mais filtros</SheetTitle>
          <SheetDescription>Refine indicadores, gráficos e listas do dashboard.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex flex-1 flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adv-movement" className="label-caps">
              Tipo de movimentação
            </Label>
            <Select
              value={draft.movementType}
              onValueChange={(v) => setDraft({ ...draft, movementType: v as MovementTypeFilter })}
            >
              <SelectTrigger id="adv-movement" className={FILTER_FIELD_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOVEMENT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adv-inactive" className="label-caps">
              Produtos parados
            </Label>
            <Select
              value={draft.inactiveDays == null ? "none" : String(draft.inactiveDays)}
              onValueChange={(v) => setDraft({ ...draft, inactiveDays: v === "none" ? null : Number(v) })}
            >
              <SelectTrigger id="adv-inactive" className={FILTER_FIELD_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INACTIVE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-3">
            <Label className="label-caps">Faixa de valor</Label>
            <Select
              value={draft.valueType ?? "none"}
              onValueChange={(v) =>
                setDraft({
                  ...draft,
                  valueType: v === "none" ? null : (v as ValueType),
                  minValue: v === "none" ? null : draft.minValue,
                  maxValue: v === "none" ? null : draft.maxValue,
                })
              }
            >
              <SelectTrigger id="adv-value-type" className={FILTER_FIELD_CLASS}>
                <SelectValue placeholder="Sem faixa de valor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem faixa de valor</SelectItem>
                {VALUE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {draft.valueType ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adv-min" className="label-caps">
                    Valor mínimo
                  </Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                      R$
                    </span>
                    <input
                      id="adv-min"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={draft.minValue ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          minValue: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className={`${FILTER_FIELD_CLASS} pl-9`}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adv-max" className="label-caps">
                    Valor máximo
                  </Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                      R$
                    </span>
                    <input
                      id="adv-max"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={draft.maxValue ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          maxValue: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className={`${FILTER_FIELD_CLASS} pl-9`}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adv-sort" className="label-caps">
              Ordenação
            </Label>
            <Select value={draft.sortBy} onValueChange={(v) => setDraft({ ...draft, sortBy: v as SortBy })}>
              <SelectTrigger id="adv-sort" className={FILTER_FIELD_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <SheetFooter className="mt-6 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button type="button" onClick={apply}>
            Aplicar filtros
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
