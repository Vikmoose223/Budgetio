export default function TransactionsLoading() {
  return (
    <div
      data-testid="transactions-loading"
      className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-6"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-9 w-24 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="mt-3 h-8 w-44 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-9 w-full animate-pulse rounded-lg bg-muted" />
      <div className="mt-6 flex flex-col gap-1.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-xl border border-border bg-card"
          />
        ))}
      </div>
    </div>
  );
}
