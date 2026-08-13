import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "ausencia" | "brand";

const tones: Record<Tone, string> = {
  neutral: "bg-ink/5 text-ink/60",
  success: "bg-forest-50 text-forest-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rust-50 text-rust-700",
  info: "bg-sky-50 text-sky-700",
  ausencia: "bg-violet-50 text-violet-700",
  brand: "bg-forest-700 text-white",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
