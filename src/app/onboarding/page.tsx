import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id, display_name")
    .eq("id", user.id)
    .single();

  // Already in a household → nothing to onboard yet (goals come in stage 2).
  if (profile?.household_id) redirect("/dashboard");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            {profile?.display_name
              ? `היי ${profile.display_name}!`
              : "ברוכים הבאים!"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            כדי להתחיל, צרו משק בית חדש או הצטרפו לזה של בן/בת הזוג.
          </p>
        </div>
        <OnboardingForm />
      </div>
    </main>
  );
}
