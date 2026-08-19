import { Check, ChevronDown, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { Product } from "@/lib/inventory";
import { FILTER_FIELD_CLASS } from "@/components/dashboard-filter-bar";

/**
 * Campo pesquisável de produto (nome ou SKU), seleção múltipla. O menu não
 * fecha a cada seleção — só ao clicar fora ou apertar Escape — e a busca
 * usa debounce de ~250ms em vez do filtro instantâneo padrão do cmdk.
 */
export function ProductFilter({
  products,
  selectedIds,
  onChange,
}: {
  products: Product[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);

  const selected = useMemo(
    () => products.filter((p) => selectedIds.includes(p.id)),
    [products, selectedIds],
  );

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  }, [products, debouncedSearch]);

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((i) => i !== id) : [...selectedIds, id]);
  };

  const remove = (id: string) => onChange(selectedIds.filter((i) => i !== id));

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="dashboard-filter-product" className="label-caps">
        Produto
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id="dashboard-filter-product"
            type="button"
            aria-haspopup="listbox"
            className={`${FILTER_FIELD_CLASS} justify-between gap-2 text-left`}
          >
            <span className={selected.length === 0 ? "text-muted-foreground" : ""}>
              {selected.length === 0
                ? "Todos os produtos"
                : `${selected.length} produto${selected.length > 1 ? "s" : ""} selecionado${selected.length > 1 ? "s" : ""}`}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <Command shouldFilter={false}>
            <div className="flex items-center border-b border-border px-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou SKU…"
                aria-label="Buscar produto por nome ou SKU"
                className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <CommandList>
              <CommandEmpty className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhum produto encontrado.
              </CommandEmpty>
              <CommandGroup>
                {filtered.map((product) => {
                  const isSelected = selectedIds.includes(product.id);
                  return (
                    <CommandItem
                      key={product.id}
                      value={product.id}
                      onSelect={() => toggle(product.id)}
                      className="cursor-pointer"
                    >
                      <span
                        className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input"
                        }`}
                        aria-hidden="true"
                      >
                        {isSelected ? <Check className="size-3" /> : null}
                      </span>
                      <span className="truncate">{product.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {product.sku}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((product) => (
            <Badge key={product.id} variant="secondary" className="gap-1 pr-1 font-normal">
              {product.name}
              <button
                type="button"
                onClick={() => remove(product.id)}
                aria-label={`Remover ${product.name} do filtro`}
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
