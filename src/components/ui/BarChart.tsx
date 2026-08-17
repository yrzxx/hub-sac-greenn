import { cn } from "@/lib/utils";

export interface BarChartDatum {
  label: string;
  value: number;
  displayValue?: string;
}

// Faixas padrão pra valores 0–100 (%): verde = bom, amber = médio, rust = baixo.
// Gráficos com outra escala (nota 0–5, 0–10...) devem passar getColorClass próprio.
export function corPorFaixa(value: number, alto = 80, medio = 50) {
  if (value >= alto) return "bg-forest-500";
  if (value >= medio) return "bg-amber-500";
  return "bg-rust-500";
}

interface BarChartProps {
  data: BarChartDatum[];
  getColorClass?: (value: number) => string;
  height?: number;
  className?: string;
}

export function BarChart({ data, getColorClass = corPorFaixa, height = 160, className }: BarChartProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div className={cn("flex gap-2 overflow-x-auto", className)} style={{ height }}>
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="flex min-w-[36px] flex-1 flex-col items-center gap-1.5">
          <span className="text-[11px] font-semibold text-ink/70 tabular-nums">
            {d.displayValue ?? d.value}
          </span>
          <div className="flex w-full flex-1 flex-col justify-end">
            <div
              className={cn("w-full rounded-t-md transition-[height] duration-300", getColorClass(d.value))}
              style={{ height: `${Math.max((Math.abs(d.value) / max) * 100, 4)}%` }}
            />
          </div>
          <span className="text-[10px] text-ink/40">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
