import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteCode } from "./invite-code";
import { Users } from "lucide-react";

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id, display_name")
    .eq("id", user.id)
    .single();

  if (!profile?.household_id) redirect("/onboarding");

  const [{ data: household }, { data: members }] = await Promise.all([
    supabase
      .from("households")
      .select("name, invite_code")
      .eq("id", profile.household_id)
      .single(),
    supabase
      .from("profiles")
      .select("id, display_name")
      .eq("household_id", profile.household_id),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">משק הבית שלכם</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          {household?.name ?? "משק בית"}
        </h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-primary" />
              חברי משק הבית
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {members?.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 text-sm text-foreground"
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-medium text-primary">
                  {(m.display_name ?? "?").slice(0, 1)}
                </span>
                {m.display_name ?? "משתמש"}
                {m.id === user.id && (
                  <span className="text-xs text-muted-foreground">(אתם)</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">הזמנת בן/בת הזוג</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              שתפו את הקוד הזה כדי שיצטרפו לאותו משק בית:
            </p>
            <InviteCode code={household?.invite_code ?? ""} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          בקרוב כאן: הגדרת יעדים, הזנת הוצאות, ייבוא מהבנק ותובנות. 🚧
        </CardContent>
      </Card>
    </div>
  );
}
