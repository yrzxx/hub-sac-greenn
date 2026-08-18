import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, AlertTriangle, PhoneCall, Search, ExternalLink, Star, Info, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog } from "@/components/ui/Dialog";
import { BarChart } from "@/components/ui/BarChart";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeConversas } from "@/hooks/useRealtimeConversas";
import { usePersistedState } from "@/hooks/usePersistedState";
import {
  fetchAtendentePerformance,
  fetchDistinctCanais,
  fetchAtendimentosComMetricas,
  fetchDistinctTiposCliente,
  fetchDistinctAtendentesConversas,
  fetchTfrTtrPercentis,
  fetchBacklogPorIdade,
  fetchRelogioPosse,
  fetchRelogioEsperaCliente,
  fetchMotivoContatoResumo,
  fetchCsatDistribuicao,
  fetchTempoRespostaBot,
  fetchContagemPeriodo,
} from "@/services/api";
import { resolvePeriodo, type PeriodoPreset } from "@/lib/dateRanges";
import { formatDuration } from "@/lib/formatDuration";
import { formatDurationFromMinutes as formatMin } from "@/lib/formatDuration";
import { cn } from "@/lib/utils";
import { DateRangePopover } from "@/components/ui/DateRangePopover";

const statusTone: Record<string, "success" | "warning" | "neutral"> = {
  resolved: "success",
  unresolved: "warning",
};
const statusLabel: Record<string, string> = { resolved: "Resolvido", unresolved: "Pendente" };

const PAGE_SIZE = 15;

type OrdenarCampo = "tempo_aberto" | "tfr" | "tempo_resolucao";
const DIRECAO_PADRAO: Record<OrdenarCampo, "asc" | "desc"> = {
  tempo_aberto: "desc",
  tfr: "desc",
  tempo_resolucao: "desc",
};

// Mesma linha do CSAT: verde (bom) / amarelo (médio) / vermelho (ruim).
function corTextoCsat(nota: number | null | undefined) {
  if (nota === null || nota === undefined) return "text-ink/70";
  if (nota >= 4.5) return "text-forest-600";
  if (nota >= 3.5) return "text-amber-600";
  return "text-rust-500";
}

function corTextoSla(pct: number | null | undefined) {
  if (pct === null || pct === undefined) return "text-ink/70";
  if (pct >= 80) return "text-forest-600";
  if (pct >= 50) return "text-amber-600";
  return "text-rust-500";
}

function corBacklogFaixa(faixa: string) {
  if (faixa === "0-1 dia") return "text-forest-600";
  if (faixa === "2-3 dias") return "text-amber-600";
  return "text-rust-500";
}

function corBacklogBarra(faixa: string) {
  if (faixa === "0-1 dia") return "bg-forest-500";
  if (faixa === "2-3 dias") return "bg-amber-500";
  if (faixa === "4-7 dias") return "bg-rust-400";
  return "bg-rust-600";
}

// Primeiro nome pra rótulo curto de gráfico — se duas pessoas tiverem o
// mesmo primeiro nome (ex: duas "Ana"), desambigua com a inicial do
// sobrenome ("Ana F.", "Ana P.") em vez de mostrar o mesmo rótulo 2x.
function nomesCurtosDisambiguados(nomesCompletos: string[]): string[] {
  const partes = nomesCompletos.map((n) => n.trim().split(/\s+/));
  const contagemPrimeiroNome = new Map<string, number>();
  partes.forEach((p) => contagemPrimeiroNome.set(p[0], (contagemPrimeiroNome.get(p[0]) ?? 0) + 1));
  return partes.map((p) => {
    const repetido = (contagemPrimeiroNome.get(p[0]) ?? 0) > 1;
    if (repetido && p.length > 1) return `${p[0]} ${p[1][0]}.`;
    return p[0];
  });
}

const CORES_VIVAS = [
  "bg-sky-500",
  "bg-rust-500",
  "bg-forest-500",
  "bg-violet-600",
  "bg-amber-600",
  "bg-sky-700",
  "bg-rust-700",
  "bg-forest-700",
];

type RankingCampo = "total_atendimentos" | "tfr_medio" | "tempo_resolucao_medio" | "csat_medio" | "total_avaliacoes";

export default function Performance() {
  useRealtimeConversas();
  const { isAdmin } = useAuth();
  const podeVer = isAdmin;

  const [aba, setAba] = usePersistedState<"ranking" | "atendimentos">("overview:aba", "ranking");
  const [preset, setPreset] = usePersistedState<PeriodoPreset>("overview:preset", "30dias");
  const [personalizado, setPersonalizado] = usePersistedState("overview:personalizado", { inicio: "", fim: "" });
  const [canal, setCanal] = usePersistedState("overview:canal", "");
  const [status, setStatus] = usePersistedState("overview:status", "");

  const [busca, setBusca] = useState("");
  const [tipoCliente, setTipoCliente] = usePersistedState("overview:tipoCliente", "");
  const [atendenteNome, setAtendenteNome] = usePersistedState("overview:atendenteNome", "");
  const [page, setPage] = useState(0);
  const [ordenarPor, setOrdenarPor] = useState<OrdenarCampo | undefined>(undefined);
  const [direcao, setDirecao] = useState<"asc" | "desc">("desc");
  const [posseDetalhe, setPosseDetalhe] = useState<string | null>(null);
  const [explicacaoVelocidadeAberta, setExplicacaoVelocidadeAberta] = useState(false);
  const [mostrarTodosMotivos, setMostrarTodosMotivos] = useState(false);

  function ordenarPorColuna(campo: OrdenarCampo) {
    if (ordenarPor === campo) {
      setDirecao((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setOrdenarPor(campo);
      setDirecao(DIRECAO_PADRAO[campo]);
    }
    setPage(0);
  }

  const { inicio, fim } = useMemo(() => resolvePeriodo(preset, personalizado), [preset, personalizado]);
  const { data: canais } = useQuery({ queryKey: ["canais"], queryFn: fetchDistinctCanais });
  const { data: tiposCliente } = useQuery({ queryKey: ["tipos-cliente"], queryFn: fetchDistinctTiposCliente });
  const { data: atendentes } = useQuery({ queryKey: ["atendentes-conversas"], queryFn: fetchDistinctAtendentesConversas });

  const { data: percentis, isLoading: loadingPercentis } = useQuery({
    queryKey: ["tfr-ttr-percentis", inicio, fim, canal],
    queryFn: () => fetchTfrTtrPercentis(inicio, fim, canal || undefined),
  });

  const { data: backlog, isLoading: loadingBacklog } = useQuery({
    queryKey: ["backlog-por-idade", canal],
    queryFn: () => fetchBacklogPorIdade(canal || undefined),
  });

  const { data: posse, isLoading: loadingPosse } = useQuery({
    queryKey: ["relogio-posse", inicio, fim, canal],
    queryFn: () => fetchRelogioPosse(inicio, fim, canal || undefined),
  });

  const { data: esperaCliente, isLoading: loadingEspera } = useQuery({
    queryKey: ["relogio-espera-cliente", inicio, fim, canal],
    queryFn: () => fetchRelogioEsperaCliente(inicio, fim, canal || undefined),
  });

  const { data: motivos, isLoading: loadingMotivos } = useQuery({
    queryKey: ["motivo-contato-resumo", inicio, fim, canal],
    queryFn: () => fetchMotivoContatoResumo(inicio, fim, canal || undefined),
  });

  const { data: csatDist } = useQuery({
    queryKey: ["csat-distribuicao", inicio, fim, canal],
    queryFn: () => fetchCsatDistribuicao(inicio, fim, canal || undefined),
  });

  const { data: contagem } = useQuery({
    queryKey: ["contagem-periodo", inicio, fim, canal],
    queryFn: () => fetchContagemPeriodo(inicio, fim, canal || undefined),
  });

  const { data: tempoRespostaBot } = useQuery({
    queryKey: ["tempo-resposta-bot", inicio, fim, canal],
    queryFn: () => fetchTempoRespostaBot(inicio, fim, canal || undefined),
  });

  const { data: posseDetalheAtendimentos, isLoading: loadingPosseDetalhe } = useQuery({
    queryKey: ["atendimentos-por-atendente", inicio, fim, posseDetalhe],
    queryFn: () => fetchAtendimentosComMetricas({ inicio, fim, atendenteNome: posseDetalhe ?? undefined, page: 0, pageSize: 50 }),
    enabled: !!posseDetalhe,
  });

  const { data: ranking, isLoading } = useQuery({
    queryKey: ["atendente-performance", inicio, fim, canal, status],
    queryFn: () => fetchAtendentePerformance(inicio, fim, canal || undefined, status || undefined),
    enabled: podeVer && aba === "ranking",
  });

  const [rankingOrdenarPor, setRankingOrdenarPor] = useState<RankingCampo | undefined>(undefined);
  const [rankingDirecao, setRankingDirecao] = useState<"asc" | "desc">("desc");

  function ordenarRankingPorColuna(campo: RankingCampo) {
    if (rankingOrdenarPor === campo) {
      setRankingDirecao((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setRankingOrdenarPor(campo);
      setRankingDirecao("desc");
    }
  }

  const iaEntry = useMemo(() => ranking?.find((r) => r.operator_nome === "IA Greenn"), [ranking]);
  const rankingHumano = useMemo(() => ranking?.filter((r) => r.operator_nome !== "IA Greenn"), [ranking]);

  const rankingOrdenado = useMemo(() => {
    if (!rankingHumano || !rankingOrdenarPor) return rankingHumano;
    const copia = [...rankingHumano];
    copia.sort((a, b) => {
      const av = a[rankingOrdenarPor] ?? -Infinity;
      const bv = b[rankingOrdenarPor] ?? -Infinity;
      return rankingDirecao === "asc" ? av - bv : bv - av;
    });
    return copia;
  }, [rankingHumano, rankingOrdenarPor, rankingDirecao]);

  const posseMap = useMemo(() => {
    const mapa = new Map<string, { minutos_posse: number; conversas: number }>();
    (posse ?? []).forEach((p) => mapa.set(p.atendente, p));
    return mapa;
  }, [posse]);

  const iaPosse = posseMap.get("IA Greenn");

  const filtrosAtendimentos = useMemo(
    () => ({
      inicio, fim,
      busca: busca || undefined,
      tipoCliente: tipoCliente || undefined,
      canal: canal || undefined,
      atendenteNome: atendenteNome || undefined,
      ordenarPor,
      direcao,
    }),
    [inicio, fim, busca, tipoCliente, canal, atendenteNome, ordenarPor, direcao]
  );

  const { data: atendimentos, isLoading: loadingAtendimentos } = useQuery({
    queryKey: ["atendimentos-metricas", filtrosAtendimentos, page],
    queryFn: () => fetchAtendimentosComMetricas({ ...filtrosAtendimentos, page, pageSize: PAGE_SIZE }),
    enabled: podeVer && aba === "atendimentos",
  });

  if (!podeVer) {
    return (
      <Card className="flex items-center gap-3 p-5">
        <Lock size={16} className="text-ink/40" />
        <p className="text-sm text-ink/50">Você não tem a permissão "Analytics" para ver o Overview do time.</p>
      </Card>
    );
  }

  const totalPages = atendimentos ? Math.ceil(atendimentos.count / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-display text-ink">Overview</h1>
          <p className="mt-1 text-sm text-ink/60">
            {aba === "ranking"
              ? "Ranking de atendentes com base nas conversas do Crisp."
              : "Lista completa de conversas vindas do Crisp — 1ª resposta considera apenas atendente humano (bot da Crisp é ignorado)."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePopover
            preset={preset}
            personalizado={personalizado}
            onChangePreset={(v) => { setPreset(v); setPage(0); }}
            onChangePersonalizado={setPersonalizado}
          />
          <SegmentedControl
            options={[["ranking", "Dashboard"], ["atendimentos", "Atendimentos"]] as const}
            value={aba}
            onChange={setAba}
          />
        </div>
      </div>

      {aba === "ranking" ? (
        <>
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <select value={canal} onChange={(e) => setCanal(e.target.value)} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
              <option value="">Todos os canais</option>
              {(canais ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
              <option value="">Todos os status</option>
              <option value="resolved">Resolvido</option>
              <option value="unresolved">Pendente</option>
            </select>
          </Card>

          {contagem && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-sky-400/30 bg-sky-500/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Total de chamados</p>
                <p className="mt-1 font-display text-kpi-lg font-bold text-sky-700">{contagem.total_chamados}</p>
              </Card>
              <Card className="border-violet-400/30 bg-violet-500/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Total de mensagens</p>
                <p className="mt-1 font-display text-kpi-lg font-bold text-violet-700">{contagem.total_mensagens}</p>
              </Card>
            </div>
          )}

          {csatDist && csatDist.total > 0 && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="border-forest-400/30 bg-forest-500/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Avaliações boas (4–5)</p>
                <p className="mt-1 font-display text-kpi-lg font-bold text-forest-600">{csatDist.boas}</p>
              </Card>
              <Card className="border-amber-400/30 bg-amber-500/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Avaliações neutras (3)</p>
                <p className="mt-1 font-display text-kpi-lg font-bold text-amber-600">{csatDist.neutras}</p>
              </Card>
              <Card className="border-rust-400/30 bg-rust-500/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Avaliações ruins (1–2)</p>
                <p className="mt-1 font-display text-kpi-lg font-bold text-rust-600">{csatDist.ruins}</p>
              </Card>
              <Card className="p-4 sm:col-span-3">
                <BarChart
                  data={[
                    { label: "Boas (4–5)", value: csatDist.boas },
                    { label: "Neutras (3)", value: csatDist.neutras },
                    { label: "Ruins (1–2)", value: csatDist.ruins },
                  ]}
                  getColorClass={(_, i) => ["bg-forest-500", "bg-amber-500", "bg-rust-500"][i ?? 0]}
                  height={110}
                />
              </Card>
            </div>
          )}

          {iaEntry && (
            <div>
              <h2 className="mb-3 font-display text-sm font-semibold text-ink">Bot (IA Greenn)</h2>
              <Card
                onClick={() => setPosseDetalhe("IA Greenn")}
                className="flex cursor-pointer flex-wrap items-center gap-6 border-sky-400/30 bg-sky-500/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Atendimentos</p>
                  <p className="mt-1 font-display text-kpi-lg font-bold text-ink">{iaEntry.total_atendimentos}</p>
                </div>
                {tempoRespostaBot && tempoRespostaBot.amostras > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Tempo médio de 1ª resposta</p>
                    <p className="mt-1 font-display text-kpi-lg font-bold text-ink">{formatDuration(tempoRespostaBot.tempo_medio_seg)}</p>
                    <p className="mt-1 text-[11px] text-ink/40">{tempoRespostaBot.amostras} amostras</p>
                  </div>
                )}
                {iaEntry.csat_medio !== null && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink/40">CSAT médio</p>
                    <p className={cn("mt-1 font-display text-kpi-lg font-bold", corTextoCsat(iaEntry.csat_medio))}>{iaEntry.csat_medio.toFixed(1)}</p>
                  </div>
                )}
                {iaPosse && (
                  <>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Chamados c/ posse</p>
                      <p className="mt-1 font-display text-kpi-lg font-bold text-ink">{iaPosse.conversas}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Tempo de posse (total)</p>
                      <p className="mt-1 font-display text-kpi-lg font-bold text-ink">{formatDuration(iaPosse.minutos_posse * 60)}</p>
                    </div>
                  </>
                )}
              </Card>
              <p className="mt-2 text-xs text-ink/40">
                Separado do ranking humano — TFR e tempo de resolução não fazem sentido pro bot (ele não "responde
                como humano" nem "resolve" no sentido usado ali).
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <h2 className="font-display text-sm font-semibold text-ink">Ranking de atendentes</h2>
            <button
              type="button"
              onClick={() => setExplicacaoVelocidadeAberta(true)}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-ink/50 hover:bg-sand-bg hover:text-ink"
            >
              <Info size={13} /> ver mais
            </button>
          </div>
          {isLoading ? (
            <p className="text-sm text-ink/50">Carregando...</p>
          ) : !ranking || ranking.length === 0 ? (
            <p className="text-sm text-ink/50">Sem atendimentos neste período/filtro.</p>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-sand-bg text-center text-xs uppercase tracking-wide text-ink/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Atendente</th>
                    <SortableHeader align="center" field="total_atendimentos" label="Total de atendimentos" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                    <SortableHeader align="center" field="tfr_medio" label="TFR médio" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                    <SortableHeader align="center" field="tempo_resolucao_medio" label="Tempo médio de resolução" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                    <SortableHeader align="center" field="csat_medio" label="CSAT médio" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                    <SortableHeader align="center" field="total_avaliacoes" label="Avaliações" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                    <th className="px-4 py-3 font-medium">Tempo de posse</th>
                    <th className="px-4 py-3 font-medium">Chamados c/ posse</th>
                    <th className="px-4 py-3 font-medium">Posse média</th>
                  </tr>
                </thead>
                <tbody>
                  {(rankingOrdenado ?? []).map((r) => {
                    const p = posseMap.get(r.operator_nome);
                    return (
                      <tr
                        key={r.operator_email ?? r.operator_nome}
                        onClick={p ? () => setPosseDetalhe(r.operator_nome) : undefined}
                        className={cn(
                          "border-t border-sand-line text-center transition-all",
                          p && "relative cursor-pointer hover:relative hover:z-10 hover:scale-[1.01] hover:bg-white hover:shadow-card-hover"
                        )}
                      >
                        <td className="px-4 py-3 text-left font-medium text-ink">{r.operator_nome}</td>
                        <td className="px-4 py-3 text-ink/70">{r.total_atendimentos}</td>
                        <td className="px-4 py-3 text-ink/70">{formatMin(r.tfr_medio)}</td>
                        <td className="px-4 py-3 text-ink/70">{formatMin(r.tempo_resolucao_medio)}</td>
                        <td className={cn("px-4 py-3 font-semibold", corTextoCsat(r.csat_medio))}>{r.csat_medio?.toFixed(1) ?? "—"}</td>
                        <td className="px-4 py-3 text-ink/70">{r.total_avaliacoes}</td>
                        <td className="px-4 py-3 text-ink/70">{p ? formatDuration(p.minutos_posse * 60) : "—"}</td>
                        <td className="px-4 py-3 text-ink/70">{p ? p.conversas : "—"}</td>
                        <td className="px-4 py-3 text-ink/70">{p ? formatDuration((p.minutos_posse / p.conversas) * 60) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          {rankingHumano && rankingHumano.length > 0 && (
            <Card className="p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/40">Volume de atendimentos por pessoa</p>
              <BarChart
                data={(() => {
                  const ordenado = [...rankingHumano].sort((a, b) => b.total_atendimentos - a.total_atendimentos);
                  const rotulos = nomesCurtosDisambiguados(ordenado.map((r) => r.operator_nome));
                  return ordenado.map((r, i) => ({ label: rotulos[i], value: r.total_atendimentos }));
                })()}
                getColorClass={(_, i) => CORES_VIVAS[i % CORES_VIVAS.length]}
                height={110}
              />
            </Card>
          )}
          <p className="text-xs text-ink/40">
            "Total de atendimentos" conta chamados onde a pessoa é a atendente registrada agora. "Chamados c/ posse"
            conta de forma diferente — inclui trechos em que a pessoa segurou o chamado mesmo que outra tenha assumido
            depois (handoff), por isso os dois números não precisam bater. Clique numa linha com posse pra ver os
            chamados específicos.
          </p>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-display text-sm font-semibold text-ink">Velocidade</h2>
              <button
                type="button"
                onClick={() => setExplicacaoVelocidadeAberta(true)}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-ink/50 hover:bg-sand-bg hover:text-ink"
              >
                <Info size={13} /> ver mais
              </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">TFR — tempo até 1ª resposta humana</p>
                {loadingPercentis ? (
                  <p className="mt-2 text-sm text-ink/50">Carregando...</p>
                ) : !percentis || percentis.tfr_amostras === 0 ? (
                  <p className="mt-2 text-sm text-ink/50">Sem amostras no período.</p>
                ) : (
                  <>
                    <p className="mt-1 font-display text-kpi-lg font-semibold text-ink">{formatDuration(percentis.tfr_media)}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/60">
                      <span>P50: {formatDuration(percentis.tfr_p50)}</span>
                      <span>P90: {formatDuration(percentis.tfr_p90)}</span>
                      <span>P95: {formatDuration(percentis.tfr_p95)}</span>
                    </div>
                    <p className={cn("mt-2 text-sm font-bold", corTextoSla(percentis.tfr_sla_pct))}>
                      SLA cumprido: {percentis.tfr_sla_pct?.toFixed(1) ?? "—"}%
                    </p>
                    <p className="mt-1 text-[11px] text-ink/40">{percentis.tfr_amostras} amostras</p>
                  </>
                )}
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">TTR — tempo até resolução</p>
                {loadingPercentis ? (
                  <p className="mt-2 text-sm text-ink/50">Carregando...</p>
                ) : !percentis || percentis.ttr_amostras === 0 ? (
                  <p className="mt-2 text-sm text-ink/50">Sem amostras no período.</p>
                ) : (
                  <>
                    <p className="mt-1 font-display text-kpi-lg font-semibold text-ink">{formatDuration(percentis.ttr_media)}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/60">
                      <span>P50: {formatDuration(percentis.ttr_p50)}</span>
                      <span>P90: {formatDuration(percentis.ttr_p90)}</span>
                      <span>P95: {formatDuration(percentis.ttr_p95)}</span>
                    </div>
                    <p className={cn("mt-2 text-sm font-bold", corTextoSla(percentis.ttr_sla_pct))}>
                      SLA cumprido: {percentis.ttr_sla_pct?.toFixed(1) ?? "—"}%
                    </p>
                    <p className="mt-1 text-[11px] text-ink/40">{percentis.ttr_amostras} amostras</p>
                  </>
                )}
              </Card>
            </div>
            <p className="mt-2 text-xs text-ink/40">
              SLA de 1ª resposta e de resolução são independentes (metas em minutos configuráveis em <code>sla_config</code>,
              hoje uma regra única global). Tempo já desconta fora de expediente.
            </p>
          </div>

          {explicacaoVelocidadeAberta && (
            <Dialog onClose={() => setExplicacaoVelocidadeAberta(false)} className="max-w-lg">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-sm font-semibold text-ink">O que significam esses números?</h3>
                <button type="button" onClick={() => setExplicacaoVelocidadeAberta(false)} className="text-ink/40 hover:text-ink">
                  <X size={16} />
                </button>
              </div>
              <div className="mt-3 space-y-3 text-sm text-ink/70">
                <p><span className="font-semibold text-ink">TFR</span> — tempo até a 1ª resposta humana. No Ranking, atribuído a quem de fato respondeu primeiro (não necessariamente quem é o atendente atual do chamado, se ele trocou de mão depois).</p>
                <p><span className="font-semibold text-ink">TTR</span> — tempo até a resolução (do início do chamado até ele ser marcado como resolvido).</p>
                <p><span className="font-semibold text-ink">Média</span> — soma de todos os tempos dividida pela quantidade de chamados. Pode ser puxada por poucos casos muito lentos (outliers).</p>
                <p><span className="font-semibold text-ink">P50 (mediana)</span> — metade dos chamados foi respondida/resolvida em até esse tempo. É o "caso típico", menos sensível a outliers que a média.</p>
                <p><span className="font-semibold text-ink">P90</span> — 90% dos chamados ficaram dentro desse tempo; só os 10% mais lentos passaram disso.</p>
                <p><span className="font-semibold text-ink">P95</span> — 95% dos chamados ficaram dentro desse tempo; captura os piores casos (só 5% foi mais lento).</p>
                <p><span className="font-semibold text-ink">SLA cumprido</span> — percentual de chamados que ficou dentro da meta configurada em <code>sla_config</code> (hoje uma meta única, em minutos, pra todo o time).</p>
              </div>
            </Dialog>
          )}

          <div>
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Operação — Backlog</h2>
            {loadingBacklog ? (
              <p className="text-sm text-ink/50">Carregando...</p>
            ) : !backlog || backlog.length === 0 ? (
              <Card className="p-4"><p className="text-sm text-ink/50">Nenhum chamado em aberto.</p></Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {(["0-1 dia", "2-3 dias", "4-7 dias", "+7 dias"] as const).map((faixa) => {
                  const total = backlog.find((b) => b.faixa === faixa)?.total ?? 0;
                  const critico = faixa === "+7 dias";
                  return (
                    <Card key={faixa} className={cn("p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover", critico && total > 0 && "border-rust-400/40 bg-rust-500/5")}>
                      <p className="text-xs font-medium uppercase tracking-wide text-ink/40">{faixa}</p>
                      <p className={cn("mt-1 font-display text-kpi-lg font-bold", total > 0 ? corBacklogFaixa(faixa) : "text-ink")}>{total}</p>
                    </Card>
                  );
                })}
              </div>
            )}
            {backlog && backlog.some((b) => b.total > 0) && (
              <Card className="mt-4 p-4">
                <BarChart
                  data={(["0-1 dia", "2-3 dias", "4-7 dias", "+7 dias"] as const).map((faixa) => ({
                    label: faixa,
                    value: backlog.find((b) => b.faixa === faixa)?.total ?? 0,
                  }))}
                  getColorClass={(_, i) => corBacklogBarra((["0-1 dia", "2-3 dias", "4-7 dias", "+7 dias"] as const)[i])}
                  height={110}
                />
              </Card>
            )}
            <p className="mt-2 text-xs text-ink/40">
              Total em aberto: {backlog?.reduce((acc, b) => acc + b.total, 0) ?? 0} chamados. Evolução histórica do
              backlog ainda não é possível — não existe um snapshot diário salvo, só o estado atual.
            </p>
          </div>

          <div>
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Relógios do atendimento</h2>
            <Card className="p-4">
              <div className="grid gap-4 border-b border-sand-line pb-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Relógio do cliente</p>
                  <p className="mt-1 text-sm text-ink/60">É o TTR mostrado em Velocidade, do ponto de vista de quem esperou.</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Relógio de espera do cliente</p>
                  {loadingEspera ? (
                    <p className="mt-1 text-sm text-ink/50">Carregando...</p>
                  ) : !esperaCliente || esperaCliente.amostras === 0 ? (
                    <p className="mt-1 text-sm text-ink/50">Sem amostras.</p>
                  ) : (
                    <>
                      <p className="mt-1 font-display text-kpi-lg font-semibold text-ink">{formatDuration((esperaCliente.minutos_espera_medio ?? 0) * 60)}</p>
                      <p className="mt-1 text-[11px] text-ink/40">{esperaCliente.amostras} janelas de espera até resposta humana (bot não conta)</p>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Relógio de trabalho ativo</p>
                  <p className="mt-1 text-sm text-ink/50">
                    Sem dado — o Crisp não expõe estado de "ativo/ausente" do operador pela API.
                  </p>
                </div>
              </div>

              <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-ink/40">Posse por atendente humano (chamados resolvidos no período)</p>
              {loadingPosse ? (
                <p className="text-sm text-ink/50">Carregando...</p>
              ) : !posse || posse.filter((p) => p.atendente !== "IA Greenn").length === 0 ? (
                <p className="text-sm text-ink/50">Sem chamados resolvidos no período pra medir posse.</p>
              ) : (
                <BarChart
                  data={posse
                    .filter((p) => p.atendente !== "IA Greenn")
                    .map((p) => ({ label: p.atendente, value: p.minutos_posse / 60, displayValue: `${(p.minutos_posse / 60).toFixed(1)}h` }))}
                  getColorClass={() => "bg-sky-500"}
                  height={120}
                />
              )}
              <p className="mt-3 text-xs text-ink/40">
                Posse = tempo entre a 1ª mensagem de um atendente num chamado e a entrada do próximo atendente (ou a
                resolução, se ninguém mais entrar) — cada trecho conta só pra quem estava "com a bola" naquele momento,
                não o TTR inteiro pra todo mundo que passou pelo chamado. Bot (IA Greenn) fica de fora daqui — vem
                separado no card acima do Ranking. Detalhamento por atendente está na tabela de Ranking, no topo da
                página.
              </p>
            </Card>
          </div>

          {posseDetalhe && (
            <Dialog onClose={() => setPosseDetalhe(null)} className="max-w-4xl">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-sm font-semibold text-ink">Chamados de {posseDetalhe}</h3>
                <button type="button" onClick={() => setPosseDetalhe(null)} className="text-ink/40 hover:text-ink">
                  <X size={16} />
                </button>
              </div>
              <div className="mt-3 max-h-[70vh] overflow-y-auto">
                {loadingPosseDetalhe ? (
                  <p className="text-sm text-ink/50">Carregando...</p>
                ) : !posseDetalheAtendimentos || posseDetalheAtendimentos.rows.length === 0 ? (
                  <p className="text-sm text-ink/50">Nenhum chamado encontrado no período.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-sand-bg text-center text-xs uppercase tracking-wide text-ink/50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Cliente</th>
                          <th className="px-3 py-2 font-medium">Início</th>
                          <th className="px-3 py-2 font-medium">1ª resposta</th>
                          <th className="px-3 py-2 font-medium">Resolução</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {posseDetalheAtendimentos.rows.map((c) => (
                          <tr key={c.id} className="border-t border-sand-line text-center align-top">
                            <td className="px-3 py-2 text-left">
                              <p className="font-medium text-ink">{c.cliente_nome ?? "—"}</p>
                              <p className="text-xs text-ink/50">{c.cliente_email}</p>
                            </td>
                            <td className="px-3 py-2 text-xs text-ink/60">{new Date(c.current_started_at).toLocaleString("pt-BR")}</td>
                            <td className="px-3 py-2 text-ink/70">
                              {c.tempo_primeira_resposta_seg !== null ? (
                                formatDuration(c.tempo_primeira_resposta_seg)
                              ) : c.tempo_primeira_resposta_geral_seg !== null ? (
                                <span title="Só o bot respondeu até agora, nenhum humano ainda">
                                  {formatDuration(c.tempo_primeira_resposta_geral_seg)} <span className="text-[11px] text-ink/40">(bot)</span>
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-2 text-ink/70">{formatDuration(c.tempo_resolucao_seg)}</td>
                            <td className="px-3 py-2">
                              <Badge tone={c.status ? statusTone[c.status] ?? "neutral" : "neutral"}>
                                {c.status ? statusLabel[c.status] ?? c.status : "—"}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              {c.link_chamado ? (
                                <a href={c.link_chamado} target="_blank" rel="noreferrer">
                                  <Button variant="secondary" size="sm">
                                    <ExternalLink size={13} /> Ver
                                  </Button>
                                </a>
                              ) : (
                                <span className="text-xs text-ink/30">sem link</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Dialog>
          )}

          <div>
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Qualidade (QA)</h2>
            <Card className="flex items-start gap-3 p-4">
              <Star size={16} className="mt-0.5 text-ink/40" />
              <p className="text-sm text-ink/50">
                Sem dado ainda — não existe hoje nenhuma avaliação de qualidade de atendimento registrada (manual ou
                automática). A estrutura de critérios com pesos (solução 30% / processo 20% / comunicação 15% /
                segurança 15% / registro 10% / empatia 10%) precisa de uma tabela nova e de um processo de avaliação
                definido antes de ter número real pra mostrar aqui — não vou estimar isso.
              </p>
            </Card>
          </div>

          <div>
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Motivo de contato</h2>
            {loadingMotivos ? (
              <p className="text-sm text-ink/50">Carregando...</p>
            ) : !motivos || motivos.length === 0 ? (
              <Card className="p-4"><p className="text-sm text-ink/50">Sem tópico classificado no período ainda — a Crisp classifica de forma assíncrona, só depois que um atendente responde.</p></Card>
            ) : (
              <>
                <Card className="mb-4 p-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/40">Top 8 tópicos por volume</p>
                  <BarChart
                    data={[...motivos]
                      .sort((a, b) => b.chamados - a.chamados)
                      .slice(0, 8)
                      .map((m) => ({ label: m.topico.split(" ").slice(0, 2).join(" "), value: m.chamados }))}
                    getColorClass={(_, i) => CORES_VIVAS[i % CORES_VIVAS.length]}
                    height={120}
                  />
                </Card>
                <Card className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-sand-bg text-center text-xs uppercase tracking-wide text-ink/50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Tópico</th>
                        <th className="px-4 py-3 font-medium">Chamados</th>
                        <th className="px-4 py-3 font-medium">TFR médio</th>
                        <th className="px-4 py-3 font-medium">TTR médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(mostrarTodosMotivos ? motivos : motivos.slice(0, 10)).map((m) => (
                        <tr key={m.topico} className="border-t border-sand-line text-center">
                          <td className="px-4 py-3 text-left font-medium text-ink">{m.topico}</td>
                          <td className="px-4 py-3 text-ink/70">{m.chamados}</td>
                          <td className="px-4 py-3 text-ink/70">{formatDuration(m.tfr_media_seg)}</td>
                          <td className="px-4 py-3 text-ink/70">{formatDuration(m.ttr_media_seg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
                {motivos.length > 10 && (
                  <div className="mt-2 flex justify-center">
                    <Button variant="secondary" size="sm" onClick={() => setMostrarTodosMotivos((v) => !v)}>
                      {mostrarTodosMotivos ? "Ver menos" : `Ver mais (${motivos.length - 10})`}
                    </Button>
                  </div>
                )}
              </>
            )}
            <p className="mt-2 text-xs text-ink/40">
              Tópico é classificado automaticamente pela Crisp por conversa — não é uma categoria fixa reutilizável, então
              essa lista pode ficar fragmentada até termos volume real suficiente pra avaliar se faz sentido agrupar por
              palavra-chave. Chamados ainda sem resposta de atendente não aparecem aqui (tópico só é atribuído depois).
            </p>
          </div>
        </>
      ) : (
        <>
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <div className="relative min-w-[220px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
              <input
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setPage(0); }}
                placeholder="Buscar por nome ou email do cliente..."
                className="h-9 w-full rounded-lg border border-sand-line bg-white pl-8 pr-2 text-sm outline-none focus:border-forest-500"
              />
            </div>
            <select value={atendenteNome} onChange={(e) => { setAtendenteNome(e.target.value); setPage(0); }} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
              <option value="">Todos os atendentes</option>
              {(atendentes ?? []).map((a) => <option key={a.nome} value={a.nome}>{a.nome}</option>)}
            </select>
            <select value={canal} onChange={(e) => { setCanal(e.target.value); setPage(0); }} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
              <option value="">Todos os canais</option>
              {(canais ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={tipoCliente} onChange={(e) => { setTipoCliente(e.target.value); setPage(0); }} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
              <option value="">Todos os tipos de cliente</option>
              {(tiposCliente ?? []).map((t) => <option key={t.tag} value={t.tag}>{t.label}</option>)}
            </select>
          </Card>

          {loadingAtendimentos ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>
          ) : !atendimentos || atendimentos.rows.length === 0 ? (
            <EmptyState icon={PhoneCall} title="Nenhum atendimento encontrado" description="Ajuste os filtros ou o período selecionado." />
          ) : (
            <>
              <Card>
                <table className="w-full table-fixed text-sm">
                  <thead className="bg-sand-bg text-center text-xs uppercase tracking-wide text-ink/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Cliente</th>
                      <th className="px-4 py-3 font-medium">Atendente</th>
                      <SortableHeader align="center" field="tempo_aberto" label="Início" ordenarPor={ordenarPor} direcao={direcao} onSort={ordenarPorColuna} />
                      <th className="px-4 py-3 font-medium">1ª resposta humana</th>
                      <SortableHeader align="center" field="tfr" label="Tempo até 1ª resposta" ordenarPor={ordenarPor} direcao={direcao} onSort={ordenarPorColuna} />
                      <SortableHeader align="center" field="tempo_resolucao" label="Resolução" ordenarPor={ordenarPor} direcao={direcao} onSort={ordenarPorColuna} className="hidden lg:table-cell" />
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atendimentos.rows.map((c) => {
                      const invalido = c.invalido_resposta_antes_inicio || c.invalido_tempo_negativo;
                      return (
                        <tr key={c.id} className={"border-t border-sand-line text-center align-top " + (invalido ? "bg-rust-500/5" : "")}>
                          <td className="truncate px-4 py-3 text-left">
                            <p className="truncate font-medium text-ink">{c.cliente_nome ?? "—"}</p>
                            <p className="truncate text-xs text-ink/50">{c.cliente_email}</p>
                          </td>
                          <td className="truncate px-4 py-3 text-ink/70">{c.operator_nome ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-ink/60">{new Date(c.current_started_at).toLocaleString("pt-BR")}</td>
                          <td className="px-4 py-3 text-xs text-ink/60">
                            {c.primeira_resposta_humana_at ? new Date(c.primeira_resposta_humana_at).toLocaleString("pt-BR") : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {c.invalido_sem_resposta_humana ? (
                              <span className="text-xs text-ink/40">sem resposta humana</span>
                            ) : invalido ? (
                              <span title="Dado inconsistente: resposta antes do início ou tempo negativo" className="inline-flex items-center gap-1 text-xs text-rust-500">
                                <AlertTriangle size={12} /> inválido
                              </span>
                            ) : (
                              formatDuration(c.tempo_primeira_resposta_seg)
                            )}
                          </td>
                          <td className="hidden px-4 py-3 text-ink/70 lg:table-cell">{formatDuration(c.tempo_resolucao_seg)}</td>
                          <td className="px-4 py-3">
                            <Badge tone={c.status ? statusTone[c.status] ?? "neutral" : "neutral"}>
                              {c.status ? statusLabel[c.status] ?? c.status : "—"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            {c.link_chamado ? (
                              <a href={c.link_chamado} target="_blank" rel="noreferrer">
                                <Button variant="secondary" size="sm">
                                  <ExternalLink size={13} /> Ver chamado
                                </Button>
                              </a>
                            ) : (
                              <span className="text-xs text-ink/30">sem link</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
              <div className="flex items-center justify-between text-sm text-ink/60">
                <span>{atendimentos.count} atendimentos</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                  <span className="flex items-center px-2 text-xs">Página {page + 1} de {Math.max(totalPages, 1)}</span>
                  <Button variant="secondary" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
