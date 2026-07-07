"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InviteCode } from "@/components/invite-code";
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
import { Loader2, RefreshCw, LogOut } from "lucide-react";

type Member = { id: string; display_name: string | null };

function newInviteCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function HouseholdSection({
  householdId,
  initialName,
  initialStartDay,
  inviteCode,
  members,
  currentUserId,
}: {
  householdId: string;
  initialName: string;
  initialStartDay: number;
  inviteCode: string;
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [startDay, setStartDay] = useState(initialStartDay);
  const [code, setCode] = useState(inviteCode);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function rename() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("households")
      .update({ name: name.trim() || "משק בית", month_start_day: startDay })
      .eq("id", householdId);
    setBusy(false);
    if (error) return toast.error("שמירה נכשלה");
    toast.success("ההגדרות עודכנו");
    router.refresh();
  }

  async function regenerate() {
    const next = newInviteCode();
    const supabase = createClient();
    const { error } = await supabase
      .from("households")
      .update({ invite_code: next })
      .eq("id", householdId);
    if (error) return toast.error("יצירת קוד נכשלה");
    setCode(next);
    toast.success("נוצר קוד הזמנה חדש");
  }

  async function leave() {
    setLeaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ household_id: null })
      .eq("id", currentUserId);
    if (error) {
      setLeaving(false);
      return toast.error("היציאה נכשלה");
    }
    router.push("/onboarding");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="hhName">שם משק הבית</Label>
          <Input
            id="hhName"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
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
            למשל אם כרטיס האשראי מחייב ב-10 לחודש, בחרו 10.
          </p>
        </div>
        <Button
          onClick={rename}
          disabled={
            busy ||
            (name.trim() === initialName.trim() && startDay === initialStartDay)
          }
          className="self-start"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          שמירה
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Label>קוד הזמנה</Label>
        <InviteCode code={code} />
        <Button
          variant="ghost"
          size="sm"
          onClick={regenerate}
          className="self-start"
        >
          <RefreshCw className="size-4" />
          יצירת קוד חדש
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Label>חברים</Label>
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-medium text-primary">
                {(m.display_name ?? "?").slice(0, 1)}
              </span>
              {m.display_name ?? "משתמש"}
              {m.id === currentUserId && (
                <span className="text-xs text-muted-foreground">(אתם)</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <Dialog>
        <DialogTrigger
          render={
            <Button variant="ghost" size="sm" className="self-start text-destructive hover:text-destructive">
              <LogOut className="size-4" />
              יציאה ממשק הבית
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>לצאת ממשק הבית?</DialogTitle>
            <DialogDescription>
              תנותקו ממשק הבית הזה ותצטרכו ליצור או להצטרף למשק בית מחדש. הנתונים
              המשותפים יישארו לבן/בת הזוג.
            </DialogDescription>
          </DialogHeader>
          <Button variant="destructive" onClick={leave} disabled={leaving}>
            {leaving && <Loader2 className="size-4 animate-spin" />}
            יציאה
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
