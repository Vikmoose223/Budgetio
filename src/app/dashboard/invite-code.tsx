"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";

export function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — user can select the text manually
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code
        dir="ltr"
        className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-center font-mono text-sm tracking-widest"
      >
        {code}
      </code>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={copy}
        aria-label="העתקת קוד"
      >
        {copied ? (
          <Check className="size-4 text-success" />
        ) : (
          <Copy className="size-4" />
        )}
      </Button>
    </div>
  );
}
