"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

export function ProfileSection({
  userId,
  initialName,
}: {
  userId: string;
  initialName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name.trim() || null })
      .eq("id", userId);
    setBusy(false);
    if (error) return toast.error("שמירה נכשלה");
    toast.success("הפרופיל עודכן");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">שם תצוגה</Label>
        <Input
          id="displayName"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <Button
        onClick={save}
        disabled={busy || name.trim() === initialName.trim()}
        className="self-start"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        שמירה
      </Button>
    </div>
  );
}

export function AccountSection({ householdId }: { householdId: string }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) return toast.error("סיסמה חייבת 6 תווים לפחות.");
    if (pw !== pw2) return toast.error("הסיסמאות אינן תואמות.");
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error("עדכון הסיסמה נכשל.");
    setPw("");
    setPw2("");
    toast.success("הסיסמה עודכנה");
  }

  async function resetData() {
    setResetting(true);
    const supabase = createClient();
    try {
      // Order matters only loosely thanks to FK cascades; delete all household data.
      for (const table of [
        "transactions",
        "budget_goals",
        "category_rules",
        "categories",
      ] as const) {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq("household_id", householdId);
        if (error) throw error;
      }
      toast.success("כל הנתונים נמחקו");
      router.push("/onboarding");
      router.refresh();
    } catch {
      toast.error("מחיקת הנתונים נכשלה.");
      setResetting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={changePassword} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw">סיסמה חדשה</Label>
            <Input
              id="pw"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="new-password"
              dir="ltr"
              className="text-left"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw2">אימות סיסמה</Label>
            <Input
              id="pw2"
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              autoComplete="new-password"
              dir="ltr"
              className="text-left"
            />
          </div>
        </div>
        <Button type="submit" disabled={busy || !pw} className="self-start">
          {busy && <Loader2 className="size-4 animate-spin" />}
          עדכון סיסמה
        </Button>
      </form>

      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm font-medium text-destructive">אזור מסוכן</p>
        <p className="mt-1 text-sm text-muted-foreground">
          מחיקת כל הקטגוריות, היעדים וההוצאות של משק הבית. פעולה זו בלתי הפיכה
          ומשפיעה על שני בני הזוג.
        </p>
        <Dialog>
          <DialogTrigger
            render={
              <Button variant="destructive" size="sm" className="mt-3">
                <Trash2 className="size-4" />
                מחיקת כל הנתונים
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>למחוק את כל הנתונים?</DialogTitle>
              <DialogDescription>
                כל הקטגוריות, היעדים וההוצאות יימחקו לצמיתות. משק הבית עצמו יישאר
                ותוכלו להגדיר מחדש. אי אפשר לבטל פעולה זו.
              </DialogDescription>
            </DialogHeader>
            <Button
              variant="destructive"
              onClick={resetData}
              disabled={resetting}
            >
              {resetting && <Loader2 className="size-4 animate-spin" />}
              כן, מחקו הכול
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
