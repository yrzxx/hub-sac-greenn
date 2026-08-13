import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Target,
  BarChart3,
  ClipboardList,
  GraduationCap,
  BookOpen,
  Link2,
  ChevronRight,
  PieChart,
  Database,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CollaboratorsOnline } from "@/components/CollaboratorsOnline";
import { fetchAnnouncements, fetchMissionProgress } from "@/services/api";

const quickAccess = [
  { to: "/missoes", label: "Missões", desc: "Acompanhe suas metas do mês", icon: Target },
  { to: "/reuniao-resultados", label: "Reunião de Resultados", desc: "Veja a comparação automática do período", icon: ClipboardList },
  { to: "/analytics", label: "Analytics", desc: "Gráficos de desempenho do time", icon: BarChart3 },
  { to: "/cursos", label: "Cursos", desc: "Continue sua trilha de aprendizado", icon: GraduationCap },
  { to: "/documentacao", label: "Documentação", desc: "Consulte processos internos", icon: BookOpen },
  { to: "/outros-links", label: "Outros Links", desc: "Acesse os sistemas do dia a dia", icon: Link2 },
  { to: "/outros-links", label: "Power BI", desc: "Indicadores consolidados", icon: PieChart },
  { to: "/outros-links", label: "Centralização", desc: "Base de clientes e contratos", icon: Database },
];

const prioridadeTone = {
  alta: "danger",
  urgente: "danger",
  media: "warning",
  baixa: "neutral",
} as const;

function getSaudacao() {
  const hora = new Date().getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

export default function Home() {
  const { user } = useAuth();
  const primeiroNome = user?.nome.split(" ")[0] ?? "";

  const { data: announcements, isLoading: loadingAnnouncements } = useQuery({
    queryKey: ["announcements", "home"],
    queryFn: () => fetchAnnouncements(3),
  });

  const { data: missionProgress, isLoading: loadingMission } = useQuery({
    queryKey: ["mission-progress", user?.id],
    queryFn: () => fetchMissionProgress(user!.id),
    enabled: Boolean(user?.id),
  });

  const missaoDestaque = missionProgress?.[0];
  const progresso = missaoDestaque
    ? Math.min(100, Math.round((missaoDestaque.atual / (missaoDestaque.missions?.meta ?? 1)) * 100))
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-display text-ink">
          {getSaudacao()}, {primeiroNome}.
        </h1>
        <p className="mt-1 text-sm text-ink/50">
          {new Date().toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })}
        </p>
      </div>

      <CollaboratorsOnline />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display text-sm font-semibold text-ink">
            Missões em Destaque
          </h2>
          {loadingMission ? (
            <div className="mt-3 h-16 animate-pulse rounded-lg bg-sand-line/50" />
          ) : missaoDestaque ? (
            <>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-sm text-ink/60">
                  {missaoDestaque.missions?.titulo}
                </p>
                <Badge tone="success">{progresso}% concluída</Badge>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-sand-bg">
                <div
                  className="h-full rounded-full bg-forest-500"
                  style={{ width: `${progresso}%` }}
                />
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-ink/50">
              Nenhuma missão atribuída a você no momento.
            </p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-sm font-semibold text-ink">
            Principais Notificações
          </h2>
          {loadingAnnouncements ? (
            <div className="mt-3 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-sand-line/50" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-sand-line/50" />
            </div>
          ) : announcements && announcements.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {announcements.slice(0, 2).map((a) => (
                <li key={a.id} className="text-sm">
                  <Badge tone={prioridadeTone[a.prioridade]} className="shrink-0">
                    {a.categoria ?? "aviso"}
                  </Badge>
                  <p className="mt-1 leading-snug text-ink/80">{a.titulo}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink/50">Nenhum comunicado publicado ainda.</p>
          )}
          <NavLink
            to="/atualizacoes"
            className="mt-3 flex items-center gap-1 text-xs font-medium text-forest-600 hover:underline"
          >
            Ver todos <ChevronRight size={14} />
          </NavLink>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-ink">
          Acessos rápidos
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {quickAccess.map(({ to, label, desc, icon: Icon }) => (
            <NavLink key={label} to={to}>
              <Card className="group h-full p-5 transition-all hover:border-forest-300">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-forest-50 text-forest-600 transition-colors group-hover:bg-forest-500 group-hover:text-white">
                  <Icon size={18} />
                </div>
                <p className="mt-3 font-display text-sm font-semibold text-ink">
                  {label}
                </p>
                <p className="mt-1 text-xs leading-snug text-ink/50">{desc}</p>
              </Card>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}
