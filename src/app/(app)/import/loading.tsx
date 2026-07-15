export default function ImportLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-6">
      <div className="space-y-2">
        <div className="h-7 w-32 animate-pulse rounded bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
      <div className="mt-6 h-40 animate-pulse rounded-2xl border border-dashed border-border bg-card" />
    </div>
  );
}
