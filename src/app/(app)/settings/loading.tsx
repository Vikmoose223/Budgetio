export default function SettingsLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-6">
      <div className="space-y-2">
        <div className="h-7 w-28 animate-pulse rounded bg-muted" />
        <div className="h-4 w-52 animate-pulse rounded bg-muted" />
      </div>
      <div className="mt-6 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl border border-border bg-card"
          />
        ))}
      </div>
    </div>
  );
}
