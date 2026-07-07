import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileSection, AccountSection } from "./account-forms";
import { HouseholdSection } from "./household-section";
import { ChevronLeft, Tags } from "lucide-react";

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id, display_name")
    .eq("id", user.id)
    .single();
  if (!profile?.household_id) redirect("/onboarding");
  const householdId = profile.household_id;

  const [{ data: household }, { data: members }] = await Promise.all([
    supabase.from("households").select("name, invite_code, month_start_day").eq("id", householdId).single(),
    supabase.from("profiles").select("id, display_name").eq("household_id", householdId),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">הגדרות</h1>

      <div className="flex flex-col gap-4">
        {/* Categories & goals — links to its own page */}
        <Link href="/settings/categories" className="block">
          <Card className="transition-colors hover:bg-accent/40">
            <CardContent className="flex items-center gap-3 py-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Tags className="size-5" />
              </span>
              <div className="flex-1">
                <p className="font-medium">קטגוריות ויעדים</p>
                <p className="text-sm text-muted-foreground">
                  עריכת קטגוריות, אייקונים, צבעים ויעדים חודשיים
                </p>
              </div>
              <ChevronLeft className="size-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">פרופיל</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileSection userId={user.id} initialName={profile.display_name ?? ""} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">משק בית</CardTitle>
          </CardHeader>
          <CardContent>
            <HouseholdSection
              householdId={householdId}
              initialName={household?.name ?? ""}
              initialStartDay={household?.month_start_day ?? 1}
              inviteCode={household?.invite_code ?? ""}
              members={members ?? []}
              currentUserId={user.id}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">חשבון</CardTitle>
          </CardHeader>
          <CardContent>
            <AccountSection householdId={householdId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
