import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mantém a mesma grade dos cards/gráficos/listas reais, só com placeholders
 * — carregar não pode deslocar o layout quando os dados chegam.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <Skeleton className="h-24 w-full rounded-xl" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="paper-panel w-full p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-8 w-20" />
          </div>
        ))}
      </div>

      <div className="paper-panel p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="paper-panel p-6">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-4 h-64 w-full" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="paper-panel p-6">
            <Skeleton className="h-5 w-32" />
            <div className="mt-4 space-y-3">
              {[0, 1, 2, 3].map((row) => (
                <Skeleton key={row} className="h-5 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
