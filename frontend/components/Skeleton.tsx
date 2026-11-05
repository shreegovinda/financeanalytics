export function ChartSkeleton() {
  return (
    <div className="w-full h-80 bg-surface-3 rounded-lg animate-pulse flex items-center justify-center">
      <div className="text-ink-4">Loading chart...</div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-surface p-6 rounded-lg shadow animate-pulse">
      <div className="h-4 bg-surface-4 rounded w-20 mb-4" />
      <div className="h-8 bg-line-strong rounded w-32" />
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <tr className="border-b border-line">
      <td className="px-6 py-4">
        <div className="h-4 bg-surface-4 rounded w-20 animate-pulse" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 bg-surface-4 rounded w-40 animate-pulse" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 bg-surface-4 rounded w-24 animate-pulse" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 bg-surface-4 rounded w-32 animate-pulse" />
      </td>
    </tr>
  );
}

export function TableSkeletonLoader({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-surface rounded-lg shadow-md overflow-hidden">
      <div className="px-6 py-4 border-b border-line">
        <div className="h-6 bg-surface-4 rounded w-48 animate-pulse" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <tbody className="bg-surface divide-y divide-line">
            {Array.from({ length: rows }).map((_, i) => (
              <TableRowSkeleton key={i} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-surface-2">
      <header className="bg-surface shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="h-8 bg-surface-4 rounded w-48 animate-pulse" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <CardGridSkeleton count={3} />

        <div className="bg-surface rounded-lg shadow p-6">
          <div className="h-6 bg-surface-4 rounded w-32 mb-6 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        </div>
      </main>
    </div>
  );
}
