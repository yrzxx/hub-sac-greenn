import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Target } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchAnnouncements } from "@/services/api";

const prioridadeTone = {
  alta: "danger",
  urgente: "danger",
  media: "warning",
  baixa: "neutral",
} as const;

const abas = [
  { valor: "todas", label: "Todas" },
  { valor: "gerais", label: "Gerais" },
  { valor: "missao", label: "Missões" },
] as const;

export default function Atualizacoes() {
  const [aba, setAba] = useState<(typeof abas)[number]["valor"]>("todas");

  const { data: announcements, isLoading } = useQuery({
    queryKey: ["announcements", "full"],
    queryFn: () => fetchAnnouncements(),
  });

  const filtradas = useMemo(() => {
    if (!announcements) return [];
    if (aba === "todas") return announcements;
    if (aba === "missao") return announcements.filter((a) => a.categoria === "missao");
    return announcements.filter((a) => a.categoria !== "missao");
  }, [announcements, aba]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-display text-ink">
            Atualizações
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Feed interno de avisos, novidades e novas missões.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-sand-bg p-1">
          {abas.map((a) => (
            <button
              key={a.valor}
              onClick={() => setAba(a.valor)}
              className={
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors " +
                (aba === a.valor ? "bg-white shadow-sm text-ink" : "text-ink/50")
              }
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : filtradas.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="Nenhuma atualização por enquanto"
          description="Novos comunicados e missões publicados aparecerão aqui."
        />
      ) : (
        <div className="relative space-y-0">
          {filtradas.map((a, i) => {
            const isMissao = a.categoria === "missao";
            return (
              <div key={a.id} className="relative flex gap-4 pb-6">
                {i < filtradas.length - 1 && (
                  <span className="absolute left-[19px] top-10 h-[calc(100%-24px)] w-px bg-sand-line" />
                )}
                <div
                  className={
                    "z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full " +
                    (isMissao ? "bg-forest-50 text-forest-600" : "bg-sand-subtle text-ink/50")
                  }
                >
                  {isMissao ? <Target size={16} /> : <Megaphone size={16} />}
                </div>
                <Card className={"flex-1 p-5" + (isMissao ? " border-forest-200 bg-forest-50/30" : "")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">Hub SAC Greenn</span>
                      <span className="text-legenda text-ink/40">
                        {new Date(a.data_publicacao).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <Badge tone={isMissao ? "brand" : prioridadeTone[a.prioridade]}>
                      {isMissao ? "Nova missão" : (a.categoria ?? "aviso")}
                    </Badge>
                  </div>
                  <h3 className="mt-2 font-display text-card-title text-ink">{a.titulo}</h3>
                  <p className="mt-1 text-sm text-ink/60">{a.descricao}</p>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
