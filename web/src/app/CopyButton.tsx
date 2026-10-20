"use client";

import { useEffect, useRef, useState } from "react";

export default function CopyButton({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
    } catch {
      // Clipboard can be blocked (insecure context, permissions). Fall back to a hint.
      setState("failed");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  }

  return (
    <button type="button" className={className} onClick={copy} aria-live="polite">
      {state === "done" ? "Copied" : state === "failed" ? "Copy manually" : "Copy"}
    </button>
  );
}
