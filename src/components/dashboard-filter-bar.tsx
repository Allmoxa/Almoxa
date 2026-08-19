import { SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ProductFilter } from "@/components/dashboard-product-filter";
import { currency } from "@/lib/inventory";
import {
  countAdvancedFilters,
  DEFAULT_FILTERS,
  getPeriodRange,
  hasAnyActiveFilter,
  toLocalDateInput,
  type DashboardFilters,
  type MovementTypeFilter,
  type PeriodPreset,
  type SortBy,
  type StockStatus,
} from "@/lib/dashboard-filters";
import type { Product } from "@/lib/inventory";

export const FILTER_FIELD_CLASS =
  "flex h-11 w-full cursor-pointer items-center rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50";

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "14d": "Últimos 14 dias",
  "30d": "Últimos 30 dias",
  month: "Este mês",
  lastMonth: "Mês anterior",
  custom: "Personalizado",
};

const STOCK_LABELS: Record<StockStatus, string> = {
  all: "Todos",
  normal: "Estoque normal",
  low: "Estoque baixo",
  zero: "Estoque zerado",
  excess: "Estoque em excesso",
};

const MOVEMENT_LABELS: Record<MovementTypeFilter, string> = {
  all: "Todas as movimentações",
  in: "Somente entradas",
  out: "Somente saídas",
};

const SORT_LABELS: Record<SortBy, string> = {
  default: "Padrão",
  topSelling: "Mais vendidos",
  leastSelling: "Menos vendidos",
  mostProfit: "Maior lucro",
  leastProfit: "Menor lucro",
  mostStock: "Maior estoque",
  leastStock: "Menor estoque",
  name: "Nome (A-Z)",
};

const VALUE_TYPE_LABELS = { cost: "Custo", sale: "Preço de venda", profit: "Lucro" } as const;

function periodChipLabel(period: DashboardFilters["period"]): string {
  if (period.preset !== "custom") return PERIOD_LABELS[period.preset];
  const range = getPeriodRange(period);
  if (!range) return "Personalizado";
  const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${fmt.format(range.start)} – ${fmt.format(range.end)}`;
}

type Chip = { key: string; label: string; onRemove: () => void };

function buildChips(
  filters: DashboardFilters,
  products: Product[],
  onChange: (next: DashboardFilters) => void,
): Chip[] {
  const chips: Chip[] = [];

  if (filters.period.preset !== DEFAULT_FILTERS.period.preset) {
    chips.push({
      key: "period",
      label: periodChipLabel(filters.period),
      onRemove: () => onChange({ ...filters, period: DEFAULT_FILTERS.period }),
    });
  }

  for (const id of filters.productIds) {
    const product = products.find((p) => p.id === id);
    if (!product) continue;
    chips.push({
      key: `product-${id}`,
      label: product.name,
      onRemove: () => onChange({ ...filters, productIds: filters.productIds.filter((p) => p !== id) }),
    });
  }

  if (filters.stockStatus !== "all") {
    chips.push({
      key: "stock",
      label: STOCK_LABELS[filters.stockStatus],
      onRemove: () => onChange({ ...filters, stockStatus: "all" }),
    });
  }

  if (filters.movementType !== "all") {
    chips.push({
      key: "movement",
      label: MOVEMENT_LABELS[filters.movementType],
      onRemove: () => onChange({ ...filters, movementType: "all" }),
    });
  }

  if (filters.inactiveDays != null) {
    chips.push({
      key: "inactive",
      label: `Sem saída há ${filters.inactiveDays} dias`,
      onRemove: () => onChange({ ...filters, inactiveDays: null }),
    });
  }

  if (filters.valueType && (filters.minValue != null || filters.maxValue != null)) {
    const min = filters.minValue != null ? currency(filters.minValue) : "";
    const max = filters.maxValue != null ? currency(filters.maxValue) : "";
    const range = min && max ? `${min} – ${max}` : min ? `a partir de ${min}` : `até ${max}`;
    chips.push({
      key: "value",
      label: `${VALUE_TYPE_LABELS[filters.valueType]}: ${range}`,
      onRemove: () => onChange({ ...filters, valueType: null, minValue: null, maxValue: null }),
    });
  }

  if (filters.sortBy !== "default") {
    chips.push({
      key: "sort",
      label: `Ordenado por: ${SORT_LABELS[filters.sortBy]}`,
      onRemove: () => onChange({ ...filters, sortBy: "default" }),
    });
  }

  return chips;
}

export function DashboardFilterBar({
  filters,
  onChange,
  products,
  advancedOpen,
  onAdvancedOpenChange,
  advancedTriggerRef,
}: {
  filters: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  products: Product[];
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  advancedTriggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const advancedCount = countAdvancedFilters(filters);
  const chips = buildChips(filters, products, onChange);
  const clearable = hasAnyActiveFilter(filters);

  const setPeriodPreset = (preset: PeriodPreset) => {
    if (preset === "custom") {
      const today = toLocalDateInput(new Date());
      onChange({
        ...filters,
        period: {
          preset,
          startDate: filters.period.startDate ?? today,
          endDate: filters.period.endDate ?? today,
        },
      });
    } else {
      onChange({ ...filters, period: { preset, startDate: null, endDate: null } });
    }
  };

  return (
    <div className="paper-panel p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[180px] flex-1 flex-col gap-1.5 sm:flex-none sm:basis-48">
          <Label htmlFor="dashboard-filter-period" className="label-caps">
            Período
          </Label>
          <Select value={filters.period.preset} onValueChange={(v) => setPeriodPreset(v as PeriodPreset)}>
            <SelectTrigger id="dashboard-filter-period" className={FILTER_FIELD_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((preset) => (
                <SelectItem key={preset} value={preset}>
                  {PERIOD_LABELS[preset]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filters.period.preset === "custom" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dashboard-filter-start" className="label-caps">
                Data inicial
              </Label>
              <input
                id="dashboard-filter-start"
                type="date"
                value={filters.period.startDate ?? ""}
                max={filters.period.endDate ?? undefined}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    period: { ...filters.period, startDate: e.target.value || null },
                  })
                }
                className={FILTER_FIELD_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dashboard-filter-end" className="label-caps">
                Data final
              </Label>
              <input
                id="dashboard-filter-end"
                type="date"
                value={filters.period.endDate ?? ""}
                min={filters.period.startDate ?? undefined}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    period: { ...filters.period, endDate: e.target.value || null },
                  })
                }
                className={FILTER_FIELD_CLASS}
              />
            </div>
          </>
        ) : null}

        <div className="min-w-[220px] flex-1 sm:flex-none sm:basis-64">
          <ProductFilter
            products={products}
            selectedIds={filters.productIds}
            onChange={(productIds) => onChange({ ...filters, productIds })}
          />
        </div>

        <div className="flex min-w-[170px] flex-1 flex-col gap-1.5 sm:flex-none sm:basis-48">
          <Label htmlFor="dashboard-filter-stock" className="label-caps">
            Situação do estoque
          </Label>
          <Select
            value={filters.stockStatus}
            onValueChange={(v) => onChange({ ...filters, stockStatus: v as StockStatus })}
          >
            <SelectTrigger id="dashboard-filter-stock" className={FILTER_FIELD_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STOCK_LABELS) as StockStatus[]).map((status) => (
                <SelectItem key={status} value={status}>
                  {STOCK_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <button
          ref={advancedTriggerRef}
          type="button"
          aria-expanded={advancedOpen}
          aria-controls="dashboard-advanced-filters-panel"
          onClick={() => onAdvancedOpenChange(true)}
          className={`${FILTER_FIELD_CLASS} relative w-auto gap-2 sm:self-end`}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Mais filtros
          {advancedCount > 0 ? (
            <Badge
              variant="default"
              className="ml-1 flex size-5 items-center justify-center rounded-full p-0 text-[11px]"
            >
              {advancedCount}
            </Badge>
          ) : null}
        </button>

        {clearable ? (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="h-11 whitespace-nowrap px-2 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline sm:self-end"
          >
            Limpar filtros
          </button>
        ) : null}
      </div>

      {chips.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          {chips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="gap-1 pr-1 font-normal">
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remover filtro: ${chip.label}`}
                className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
