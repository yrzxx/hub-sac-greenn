import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Star,
  MessagesSquare,
  Timer,
  Coins,
  GraduationCap,
  Target,
  CheckCircle2,
  PhoneCall,
  ArrowUpDown,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/Card";
import { Kpi } from "@/components/ui/Kpi";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { DateRangePopover } from "@/components/ui/DateRangePopover";
import {
  fetchCsatForUser,
  fetchMissionProgress,
  fetchCourseProgressForUser,
  fetchMinhasConversasMetricas,
} from "@/services/api";
import {
  resolvePeriodo,
  periodoAnterior,
  type PeriodoPreset,
} from "@/lib/dateRanges";
import { formatDuration } from "@/lib/formatDuration";
import type { DbCsatResult } from "@/types/database";
import { CsatDetalheDialog } from "@/components/CsatDetalheDialog";

function media(vals: (number | null)[]) {
  const validos = vals.filter((v): v is number => v !== null);
  return validos.length ? validos.reduce((a, b) => a + b, 0) / validos.length : null;
}

function variacao(atual: number | null, anterior: number | null) {
  if (atual === null || anterior === null || anterior === 0) return undefined;
  return ((atual - anterior) / anterior) * 100;
}

const META_SATISFACAO = 97;

type SortField = "data_hora" | "nota" | "classificacao_csat";

export default function MeuPainel() {
  const { user } = useAuth();
  const [preset, setPreset] = useState<PeriodoPreset>("mes_atual");
  const [personalizado, setPersonalizado] = useState({ inicio: "", fim: "" });
  const [sortField, setSortField] = useState<SortField>("data_hora");
  const [sortAsc, setSortAsc] = useState(false);
  const [detalhe, setDetalhe] = useState<DbCsatResult | null>(null);

  const { inicio, fim } = useMemo(
    () => resolvePeriodo(preset, personalizado),
    [preset, personalizado]
  );
  const { inicio: inicioAnterior, fim: fimAnterior } = useMemo(
    () => periodoAnterior(inicio, fim),
    [inicio, fim]
  );

  const { data: csat, isLoading: loadingCsat } = useQuery({
    queryKey: ["csat", user?.id],
    queryFn: () => fetchCsatForUser(user!.email),
    enabled: Boolean(user?.id),
  });

  const { data: conversas, isLoading: loadingConversas } = useQuery({
    queryKey: ["minhas-conversas-metricas", user?.email, inicio.toISOString(), fim.toISOString()],
    queryFn: () => fetchMinhasConversasMetricas(inicio, fim),
    enabled: Boolean(user?.email),
  });
  const { data: conversasAnterior } = useQuery({
    queryKey: ["minhas-conversas-metricas-anterior", user?.email, inicioAnterior.toISOString()],
    queryFn: () => fetchMinhasConversasMetricas(inicioAnterior, fimAnterior),
    enabled: Boolean(user?.email),
  });

  const { data: missions, isLoading: loadingMissions } = useQuery({
    queryKey: ["mission-progress", user?.id],
    queryFn: () => fetchMissionProgress(user!.id),
    enabled: Boolean(user?.id),
  });

  const { data: courses, isLoading: loadingCourses } = useQuery({
    queryKey: ["course-progress", user?.id],
    queryFn: () => fetchCourseProgressForUser(user!.id),
    enabled: Boolean(user?.id),
  });

  if (!user) return null;

  const csatPeriodo = (csat ?? []).filter((c) => {
    const d = new Date(c.data_hora);
    return d >= inicio && d <= fim;
  });
  const csatAnterior = (csat ?? []).filter((c) => {
    const d = new Date(c.data_hora);
    return d >= inicioAnterior && d <= fimAnterior;
  });

  function calcularSatisfacao(rows: DbCsatResult[]) {
    const notas = rows.map((c) => c.nota).filter((n): n is number => n !== null);
    const satisfeitos = notas.filter((n) => n >= 4).length;
    return { total: notas.length, pct: notas.length ? (satisfeitos / notas.length) * 100 : null };
  }

  const atual = calcularSatisfacao(csatPeriodo);
  const anteriorStats = calcularSatisfacao(csatAnterior);

  const conversasPeriodo = conversas ?? [];
  const conversasAnteriorLista = conversasAnterior ?? [];
  // "Total de chamados"/"Tempo de resolução" refletem a carteira atual (conversas
  // que estão comigo agora); "Tempo de primeira resposta" usa a lista inteira,
  // porque conta sempre que fui eu quem respondeu primeiro, mesmo se a conversa
  // foi repassada depois — mesmo critério usado no ranking de Overview.
  const conversasPeriodoCarteira = conversasPeriodo.filter((c) => c.minha_carteira);
  const conversasAnteriorCarteira = conversasAnteriorLista.filter((c) => c.minha_carteira);
  const tempoPrimeiraResposta = media(conversasPeriodo.map((c) => c.tempo_primeira_resposta_seg));
  const tempoPrimeiraRespostaAnterior = media(conversasAnteriorLista.map((c) => c.tempo_primeira_resposta_seg));
  const tempoResolucao = media(conversasPeriodoCarteira.map((c) => c.tempo_resolucao_seg));
  const tempoResolucaoAnterior = media(conversasAnteriorCarteira.map((c) => c.tempo_resolucao_seg));

  const missoesConcluidas = (missions ?? []).filter(
    (m) => m.atual >= (m.missions?.meta ?? Infinity)
  );
  const missoesEmAndamento = (missions ?? []).filter(
    (m) => m.atual < (m.missions?.meta ?? Infinity)
  );
  const totalMoedas = missoesConcluidas.reduce((acc, m) => acc + (m.missions?.moedas ?? 0), 0);
  const cursosConcluidos = (courses ?? []).filter((c) => c.concluido).length;

  const evolucaoMensal = useMemo(() => {
    const grupos = new Map<string, number[]>();
    (csat ?? []).forEach((c) => {
      if (c.nota === null) return;
      const mes = c.data_hora.slice(0, 7);
      const arr = grupos.get(mes) ?? [];
      arr.push(c.nota);
      grupos.set(mes, arr);
    });
    return Array.from(grupos.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([mes, notasDoMes]) => {
        const satisf = notasDoMes.filter((n) => n >= 4).length;
        const pct = Math.round((satisf / notasDoMes.length) * 100);
        return { mes: mes.slice(5), pct };
      });
  }, [csat]);

  function alternarOrdenacao(campo: SortField) {
    if (sortField === campo) setSortAsc(!sortAsc);
    else {
      setSortField(campo);
      setSortAsc(false);
    }
  }

  const linhasOrdenadas = useMemo(() => {
    const copia = [...csatPeriodo];
    copia.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortField === "data_hora") {
        va = a.data_hora;
        vb = b.data_hora;
      } else if (sortField === "nota") {
        va = a.nota ?? -1;
        vb = b.nota ?? -1;
      } else {
        va = a.classificacao_csat ?? "";
        vb = b.classificacao_csat ?? "";
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return copia;
  }, [csatPeriodo, sortField, sortAsc]);

  return (
    <div className="space-y-8">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar nome={user.nome} size="md" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[18px] font-semibold text-ink">{user.nome}</h1>
              <Badge tone="success" className="h-6 gap-1 px-2.5 py-0 text-[12px]">
                <span className="h-1.5 w-1.5 rounded-full bg-forest-500" /> Online
              </Badge>
            </div>
            <p className="text-[13px] text-ink/50">
              {user.cargo} · {user.equipe}
            </p>
          </div>
          <div className="flex h-8 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 text-[13px] font-medium text-amber-700">
            <Coins size={14} /> Minhas moedas: {totalMoedas}
          </div>
          <DateRangePopover
            preset={preset}
            personalizado={personalizado}
            onChangePreset={setPreset}
            onChangePersonalizado={setPersonalizado}
          />
        </div>
      </Card>

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-ink">
          Indicadores do período
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Kpi
            label="Total de chamados"
            value={loadingConversas ? "..." : String(conversasPeriodoCarteira.length)}
            delta={variacao(conversasPeriodoCarteira.length, conversasAnteriorCarteira.length || null)}
            icon={PhoneCall}
          />
          <Kpi
            label="Tempo de primeira resposta"
            value={loadingConversas ? "..." : formatDuration(tempoPrimeiraResposta)}
            delta={variacao(tempoPrimeiraResposta, tempoPrimeiraRespostaAnterior)}
            invertDeltaColor
            icon={Timer}
          />
          <Kpi
            label="Tempo de resolução"
            value={loadingConversas ? "..." : formatDuration(tempoResolucao)}
            delta={variacao(tempoResolucao, tempoResolucaoAnterior)}
            invertDeltaColor
            icon={Timer}
          />
          <Kpi
            label="Total de avaliações"
            value={loadingCsat ? "..." : String(atual.total)}
            delta={variacao(atual.total, anteriorStats.total || null)}
            icon={MessagesSquare}
          />
          <Kpi
            label="CSAT"
            value={loadingCsat ? "..." : atual.pct !== null ? `${atual.pct.toFixed(2)}%` : "—"}
            delta={variacao(atual.pct, anteriorStats.pct)}
            meta={`Meta ${META_SATISFACAO.toFixed(2)}%`}
            icon={Star}
          />
        </div>
        <p className="mt-2 text-xs text-ink/40">
          Tempo de primeira resposta considera apenas mensagens de atendente humano — respostas automáticas do bot da Crisp são ignoradas.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="p-5 pb-0">
            <h2 className="font-display text-sm font-semibold text-ink">Missões</h2>
          </div>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-ink/70">
                <Target size={14} /> Em andamento
              </span>
              <Badge tone="warning">{loadingMissions ? "..." : missoesEmAndamento.length}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-ink/70">
                <CheckCircle2 size={14} /> Concluídas
              </span>
              <Badge tone="success">{loadingMissions ? "..." : missoesConcluidas.length}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <div className="p-5 pb-0">
            <h2 className="font-display text-sm font-semibold text-ink">Cursos</h2>
          </div>
          <CardContent>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-ink/70">
                <GraduationCap size={14} /> Concluídos
              </span>
              <Badge tone="success">{loadingCourses ? "..." : cursosConcluidos}</Badge>
            </div>
            <p className="mt-2 text-xs text-ink/40">
              De {courses?.length ?? 0} cursos disponíveis.
            </p>
          </CardContent>
        </Card>

        <Card>
          <div className="p-5 pb-0">
            <h2 className="font-display text-sm font-semibold text-ink">
              Evolução do período
            </h2>
          </div>
          <CardContent>
            {evolucaoMensal.length === 0 ? (
              <p className="text-sm text-ink/50">Sem dados suficientes ainda.</p>
            ) : (
              <div className="flex h-28 items-end gap-2">
                {evolucaoMensal.map((m) => (
                  <div key={m.mes} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-medium text-ink/50">{m.pct}%</span>
                    <div
                      className={
                        "w-full rounded-t-md " + (m.pct >= 80 ? "bg-forest-500" : "bg-rust-500/70")
                      }
                      style={{ height: `${Math.max(m.pct, 4)}%` }}
                    />
                    <span className="text-[10px] uppercase text-ink/40">{m.mes}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="p-5 pb-0">
          <h2 className="font-display text-sm font-semibold text-ink">
            Últimas avaliações de CSAT no período
          </h2>
        </div>
        <CardContent className="overflow-x-auto p-0">
          {loadingCsat ? (
            <p className="p-5 text-sm text-ink/50">Carregando...</p>
          ) : csatPeriodo.length === 0 ? (
            <p className="p-5 text-sm text-ink/50">Nenhuma avaliação neste período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-ink/40">
                <tr>
                  <th className="cursor-pointer select-none px-5 py-3 font-medium" onClick={() => alternarOrdenacao("data_hora")}>
                    <span className="flex items-center gap-1">Data <ArrowUpDown size={11} /></span>
                  </th>
                  <th className="px-5 py-3 font-medium">Colaborador</th>
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">Categoria</th>
                  <th className="cursor-pointer select-none px-5 py-3 font-medium" onClick={() => alternarOrdenacao("nota")}>
                    <span className="flex items-center gap-1">Nota <ArrowUpDown size={11} /></span>
                  </th>
                  <th className="cursor-pointer select-none px-5 py-3 font-medium" onClick={() => alternarOrdenacao("classificacao_csat")}>
                    <span className="flex items-center gap-1">Classificação <ArrowUpDown size={11} /></span>
                  </th>
                  <th className="px-5 py-3 font-medium">Comentário</th>
                </tr>
              </thead>
              <tbody>
                {linhasOrdenadas.slice(0, 8).map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setDetalhe(c)}
                    className="cursor-pointer border-t border-sand-line/70 transition-all hover:relative hover:z-10 hover:scale-[1.01] hover:bg-white hover:shadow-card-hover"
                  >
                    <td className="px-5 py-3 text-ink/60">
                      {new Date(c.data_hora).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-5 py-3 text-ink">{c.atendente}</td>
                    <td className="px-5 py-3">
                      <p className="text-ink">{c.cliente ?? "—"}</p>
                      <p className="text-xs text-ink/40">{c.email ?? "—"}</p>
                    </td>
                    <td className="px-5 py-3 text-ink/60">{c.topico ?? "—"}</td>
                    <td className="px-5 py-3 font-medium text-ink">{c.nota ?? "—"}</td>
                    <td className="px-5 py-3">
                      <Badge tone={(c.nota ?? 0) >= 4 ? "success" : "danger"}>
                        {c.classificacao_csat ?? "—"}
                      </Badge>
                    </td>
                    <td className="max-w-[220px] truncate px-5 py-3 text-ink/60" title={c.comentario ?? undefined}>
                      {c.comentario ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {detalhe && <CsatDetalheDialog registro={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  );
}
