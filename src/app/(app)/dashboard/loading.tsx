export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-border bg-card"
          />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />
        <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />
      </div>
      <div className="mt-4 h-56 animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}
