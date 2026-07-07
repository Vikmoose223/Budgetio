"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Home, Loader2, UserPlus } from "lucide-react";

type Mode = "create" | "join";

export function OnboardingForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("create");
  const [householdName, setHouseholdName] = useState("");
  const [startDay, setStartDay] = useState(1);
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    try {
      if (mode === "create") {
        const { data: hid, error } = await supabase.rpc("create_household", {
          p_name: householdName.trim() || "משק בית",
        });
        if (error) throw error;
        if (startDay !== 1 && hid) {
          await supabase
            .from("households")
            .update({ month_start_day: startDay })
            .eq("id", hid);
        }
      } else {
        const { error } = await supabase.rpc("join_household", {
          p_invite_code: inviteCode.trim(),
        });
        if (error) throw error;
      }
      // Re-enter onboarding: a new household advances to category setup,
      // while joining one that's already set up will redirect to the dashboard.
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        /invalid invite code/i.test(message)
          ? "קוד ההזמנה שגוי. בדקו שוב מול בן/בת הזוג."
          : "משהו השתבש. נסו שוב.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v as Mode);
            setError(null);
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="create">
              <Home className="size-4" />
              משק בית חדש
            </TabsTrigger>
            <TabsTrigger value="join">
              <UserPlus className="size-4" />
              הצטרפות
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
            <TabsContent value="create" className="m-0 p-0">
              <div className="flex flex-col gap-2">
                <Label htmlFor="householdName">שם משק הבית</Label>
                <Input
                  id="householdName"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="למשל: המשפחה שלנו"
                  required={mode === "create"}
                />
                <p className="text-xs text-muted-foreground">
                  אחרי היצירה תקבלו קוד הזמנה לשתף עם בן/בת הזוג.
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <Label htmlFor="startDay">היום שבו מתחיל החודש התקציבי</Label>
                <select
                  id="startDay"
                  value={startDay}
                  onChange={(e) => setStartDay(Number(e.target.value))}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d === 1 ? "1 (חודש קלנדרי)" : d}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  אם כרטיס האשראי מחייב באמצע החודש (למשל ה-10), בחרו את היום הזה
                  כדי שהחודש התקציבי יתאים לחיוב.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="join" className="m-0 p-0">
              <div className="flex flex-col gap-2">
                <Label htmlFor="inviteCode">קוד הזמנה</Label>
                <Input
                  id="inviteCode"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="הדביקו את הקוד שקיבלתם"
                  required={mode === "join"}
                  dir="ltr"
                  className="text-left"
                />
              </div>
            </TabsContent>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="size-4 animate-spin" />}
              {mode === "create" ? "יצירת משק בית" : "הצטרפות"}
            </Button>
          </form>
        </Tabs>
      </CardContent>
    </Card>
  );
}
