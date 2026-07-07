import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";
import { CategorySetup } from "./category-setup";

export default async function OnboardingPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id, display_name")
    .eq("id", user.id)
    .single();

  // Step 1 — no household yet: create one or join a partner's.
  if (!profile?.household_id) {
    return (
      <OnboardingShell
        title={
          profile?.display_name ? `היי ${profile.display_name}!` : "ברוכים הבאים!"
        }
        subtitle="כדי להתחיל, צרו משק בית חדש או הצטרפו לזה של בן/בת הזוג."
      >
        <OnboardingForm />
      </OnboardingShell>
    );
  }

  // If the household already has categories, onboarding is done.
  const { data: existing } = await supabase
    .from("categories")
    .select("id")
    .eq("household_id", profile.household_id)
    .limit(1);
  if (existing && existing.length > 0) redirect("/dashboard");

  // Step 2 — set up categories and monthly goals.
  return (
    <OnboardingShell
      title="נגדיר את התקציב"
      subtitle="בחרו את הקטגוריות שלכם והגדירו יעד חודשי לכל אחת. תמיד אפשר לשנות אחר כך."
      wide
    >
      <CategorySetup householdId={profile.household_id} />
    </OnboardingShell>
  );
}

function OnboardingShell({
  title,
  subtitle,
  wide,
  children,
}: {
  title: string;
  subtitle: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 items-start justify-center px-6 py-12 sm:py-16">
      <div className={wide ? "w-full max-w-xl" : "w-full max-w-md"}>
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {subtitle}
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
