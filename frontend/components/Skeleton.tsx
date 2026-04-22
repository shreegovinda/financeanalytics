export function ChartSkeleton() {
  return (
    <div className="w-full h-80 bg-gray-100 rounded-lg animate-pulse flex items-center justify-center">
      <div className="text-gray-400">Loading chart...</div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white p-6 rounded-lg shadow animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-20 mb-4" />
      <div className="h-8 bg-gray-300 rounded w-32" />
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <tr className="border-b border-gray-200">
      <td className="px-6 py-4">
        <div className="h-4 bg-gray-200 rounded w-20 animate-pulse" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 bg-gray-200 rounded w-40 animate-pulse" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 bg-gray-200 rounded w-24 animate-pulse" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 bg-gray-200 rounded w-32 animate-pulse" />
      </td>
    </tr>
  );
}

export function TableSkeletonLoader({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="h-6 bg-gray-200 rounded w-48 animate-pulse" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <tbody className="bg-white divide-y divide-gray-200">
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="h-8 bg-gray-200 rounded w-48 animate-pulse" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <CardGridSkeleton count={3} />

        <div className="bg-white rounded-lg shadow p-6">
          <div className="h-6 bg-gray-200 rounded w-32 mb-6 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        </div>
      </main>
    </div>
  );
}
