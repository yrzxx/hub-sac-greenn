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

// Primeiro nome pra rótulo curto (ex: gráfico) — se duas pessoas tiverem o
// mesmo primeiro nome (ex: duas "Ana"), desambigua com a inicial do
// sobrenome ("Ana F.", "Ana P.") em vez de mostrar o mesmo rótulo 2x.
export function nomesCurtosDisambiguados(nomesCompletos: string[]): string[] {
  const partes = nomesCompletos.map((n) => n.trim().split(/\s+/));
  const contagemPrimeiroNome = new Map<string, number>();
  partes.forEach((p) => contagemPrimeiroNome.set(p[0], (contagemPrimeiroNome.get(p[0]) ?? 0) + 1));
  return partes.map((p) => {
    const repetido = (contagemPrimeiroNome.get(p[0]) ?? 0) > 1;
    if (repetido && p.length > 1) return `${p[0]} ${p[1][0]}.`;
    return p[0];
  });
}
