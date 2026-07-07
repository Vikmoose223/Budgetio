import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PiggyBank, Upload, Sparkles, Target } from "lucide-react";

const features = [
  {
    icon: Target,
    title: "יעדים לכל קטגוריה",
    body: "מגדירים תקציב חודשי לכל תחום ורואים מיד איפה עומדים מולו.",
  },
  {
    icon: Upload,
    title: "ייבוא מהבנק",
    body: "מעלים קובץ אקסל, המערכת מסווגת לקטגוריות ומחכה לאישור שלכם.",
  },
  {
    icon: PiggyBank,
    title: "מעקב חיסכון",
    body: "עוקבים אחרי יעדי החיסכון המשותפים לאורך החודשים.",
  },
  {
    icon: Sparkles,
    title: "תובנות חכמות",
    body: "המערכת מצביעה על חריגות, מגמות והזדמנויות לחסוך.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground shadow-sm">
          <PiggyBank className="size-4 text-primary" />
          תקציב זוגי
        </span>

        <h1 className="mt-8 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          לנהל את הכסף שלכם,
          <br />
          <span className="text-primary">ביחד ובבהירות</span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
          מעקב הוצאות, יעדים ותובנות לזוג — הזנה ידנית או ייבוא ישיר מהבנק,
          הכול נשמר אוטומטית במקום אחד.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/login" className={cn(buttonVariants({ size: "lg" }))}>
            מתחילים
          </Link>
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
          >
            לדשבורד
          </Link>
        </div>
      </div>

      <div className="mt-16 grid w-full max-w-4xl gap-4 sm:grid-cols-2">
        {features.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-xl border border-border bg-card p-5 text-right shadow-sm"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
              <Icon className="size-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-card-foreground">
              {title}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              {body}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
