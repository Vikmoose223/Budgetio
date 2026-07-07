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
import { Loader2, MailCheck } from "lucide-react";

type Mode = "login" | "signup";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push(next);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName.trim() || null } },
        });
        if (error) throw error;
        // Email confirmation off → a session is returned immediately.
        if (data.session) {
          router.push("/onboarding");
          router.refresh();
        } else {
          setCheckEmail(true);
        }
      }
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (checkEmail) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-accent text-primary">
            <MailCheck className="size-5" />
          </div>
          <p className="font-medium">כמעט שם!</p>
          <p className="text-sm text-muted-foreground">
            שלחנו קישור אישור לכתובת <span className="font-medium">{email}</span>.
            לחצו עליו כדי להשלים את ההרשמה ואז חזרו להתחבר.
          </p>
        </CardContent>
      </Card>
    );
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
            <TabsTrigger value="login">כניסה</TabsTrigger>
            <TabsTrigger value="signup">הרשמה</TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
            <TabsContent value="signup" className="m-0 p-0">
              <div className="flex flex-col gap-2">
                <Label htmlFor="displayName">איך קוראים לך?</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="השם שלך"
                  autoComplete="name"
                />
              </div>
            </TabsContent>

            <div className="flex flex-col gap-2">
              <Label htmlFor="email">אימייל</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                dir="ltr"
                className="text-left"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">סיסמה</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="לפחות 6 תווים"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                dir="ltr"
                className="text-left"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={loading} className="mt-1 w-full">
              {loading && <Loader2 className="size-4 animate-spin" />}
              {mode === "login" ? "כניסה" : "יצירת חשבון"}
            </Button>
          </form>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function translateAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/invalid login credentials/i.test(message))
    return "אימייל או סיסמה שגויים.";
  if (/user already registered/i.test(message))
    return "כתובת האימייל כבר רשומה. נסו להתחבר.";
  if (/password should be at least/i.test(message))
    return "הסיסמה צריכה להיות באורך 6 תווים לפחות.";
  if (/email not confirmed/i.test(message))
    return "יש לאשר קודם את כתובת האימייל דרך הקישור שנשלח.";
  return "משהו השתבש. נסו שוב.";
}
