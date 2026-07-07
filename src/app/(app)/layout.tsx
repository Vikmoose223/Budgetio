import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/nav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <AppHeader />
      {/* pb leaves room for the fixed mobile bottom nav */}
      <main className="flex-1 pb-20 sm:pb-0">{children}</main>
      <BottomNav />
    </div>
  );
}
