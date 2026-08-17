/**
 * Páginas a mostrar no rodapé: as vizinhas da atual, mais a primeira e a última.
 * Acima de sete páginas o resto vira reticências, senão a linha de botões passa
 * a rolar de lado no celular.
 */
function pageWindow(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const around = [current - 1, current, current + 1].filter((page) => page > 1 && page < total);
  const pages = [1, ...around, total];
  const out: (number | "gap")[] = [];
  pages.forEach((page, index) => {
    const previous = pages[index - 1];
    if (previous !== undefined && page - previous > 1) out.push("gap");
    out.push(page);
  });
  return out;
}

export function PaginationNav({
  currentPage,
  pageCount,
  onChange,
  label,
}: {
  currentPage: number;
  pageCount: number;
  onChange: (page: number) => void;
  label: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={label} className="flex items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="rounded-md border border-border-strong px-3 py-1.5 text-sm transition-colors hover:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent"
      >
        Anterior
      </button>

      {pageWindow(currentPage, pageCount).map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} className="px-1.5 text-sm text-muted-foreground">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            aria-current={item === currentPage ? "page" : undefined}
            className={`min-w-9 rounded-md border px-2.5 py-1.5 text-sm tabular-nums transition-colors ${
              item === currentPage
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border-strong text-muted-foreground hover:bg-secondary"
            }`}
          >
            {item}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onChange(currentPage + 1)}
        disabled={currentPage === pageCount}
        className="rounded-md border border-border-strong px-3 py-1.5 text-sm transition-colors hover:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent"
      >
        Próxima
      </button>
    </nav>
  );
}
