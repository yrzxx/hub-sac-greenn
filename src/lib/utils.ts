import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDelta(delta?: number) {
  if (delta === undefined) return null;
  const sinal = delta > 0 ? "+" : "";
  return `${sinal}${delta.toFixed(1)}%`;
}
