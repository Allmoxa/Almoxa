import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { qty, type Product } from "@/lib/inventory";

type Props = {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  /** Nome lido da notinha que não casou com nenhum produto, usado como texto inicial. */
  fallbackLabel?: string;
  className?: string;
};

const inputClass =
  "w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-ring";

/** Altura máxima da lista e folga entre ela e o campo, em px. */
const MAX_LIST = 240;
const GAP = 4;

type Anchor = {
  left: number;
  width: number;
  top: number;
  bottom: number;
  flip: boolean;
  maxHeight: number;
};

/** Busca sem acento e sem caixa: quem digita "camiseta" acha "Camiseta Básica". */
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/**
 * Escolha de produto por digitação. Substitui o <select> nativo, que obriga a
 * percorrer a lista inteira — inviável no celular quando a barraca tem dezenas
 * de itens. Digitar filtra por nome ou código; setas e Enter escolhem.
 *
 * Produtos zerados continuam na lista, marcados. Some-los faria o item sumir
 * sem explicação, que é pior do que mostrar por que ele não serve.
 */
export function ProductPicker({ products, value, onChange, fallbackLabel, className }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  // null = mostrar o produto escolhido; string = o que a pessoa está digitando.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const selected = products.find((product) => product.id === value) ?? null;
  const label = selected ? selected.name : (fallbackLabel ?? "");
  const text = query ?? label;

  const matches = useMemo(() => {
    const term = normalize(query ?? "");
    if (!term) return products;
    return products.filter(
      (product) => normalize(product.name).includes(term) || normalize(product.sku).includes(term),
    );
  }, [products, query]);

  // A lista sai num portal com posição fixa porque um dos usos fica dentro de
  // uma tabela com overflow-x-auto, que recortaria um dropdown absoluto. Medir
  // aqui e reposicionar no scroll é o preço de escapar desse recorte.
  const measure = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP;
    const above = rect.top - GAP;
    const flip = below < Math.min(MAX_LIST, above);
    setAnchor({
      left: rect.left,
      width: rect.width,
      top: rect.bottom + GAP,
      bottom: window.innerHeight - rect.top + GAP,
      flip,
      maxHeight: Math.max(96, Math.min(MAX_LIST, flip ? above : below)),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    measure();
    // capture: pega também o scroll de containers internos, não só o da janela.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, measure]);

  // Some ao clicar fora sem escolher nada: o texto digitado volta a mostrar o
  // produto que estava selecionado, para não parecer que houve escolha. A lista
  // conta como "dentro" mesmo estando no portal.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setOpen(false);
        setQuery(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (active >= matches.length) setActive(0);
  }, [matches.length, active]);

  const choose = (product: Product) => {
    onChange(product.id);
    setQuery(null);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => {
        if (matches.length === 0) return 0;
        return (current + step + matches.length) % matches.length;
      });
      return;
    }
    if (event.key === "Enter") {
      const product = matches[active];
      if (open && product) {
        event.preventDefault();
        choose(product);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setQuery(null);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ""}`}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && matches[active] ? `${listId}-${matches[active].id}` : undefined
        }
        autoComplete="off"
        placeholder="Digite o nome do produto…"
        value={text}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={inputClass}
      />

      {open && anchor && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              style={{
                position: "fixed",
                left: anchor.left,
                width: anchor.width,
                maxHeight: anchor.maxHeight,
                ...(anchor.flip ? { bottom: anchor.bottom } : { top: anchor.top }),
              }}
              className="z-[60] overflow-y-auto overscroll-contain rounded-md border border-border-strong bg-card py-1 shadow-lg"
            >
              {matches.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  Nenhum produto com esse nome
                </li>
              ) : (
                matches.map((product, index) => {
                  const empty = product.quantity <= 0;
                  return (
                    <li
                      key={product.id}
                      id={`${listId}-${product.id}`}
                      role="option"
                      aria-selected={index === active}
                    >
                      <button
                        type="button"
                        // Escolher no mousedown, antes do blur do input fechar a lista.
                        onMouseDown={(event) => {
                          event.preventDefault();
                          choose(product);
                        }}
                        onMouseEnter={() => setActive(index)}
                        className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                          index === active ? "bg-secondary" : ""
                        }`}
                      >
                        <span className="truncate">
                          {product.name}
                          {product.sku ? (
                            <span className="ml-2 font-mono text-[0.7rem] text-muted-foreground">
                              {product.sku}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={`shrink-0 text-xs ${empty ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {empty ? "sem estoque" : `${qty(product.quantity)} un.`}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
