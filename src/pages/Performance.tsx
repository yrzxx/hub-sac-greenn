import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Lock, AlertTriangle, PhoneCall, Search, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeConversas } from "@/hooks/useRealtimeConversas";
import {
  fetchAtendentePerformance,
  fetchDistinctCanais,
  fetchConversasNotaBaixa,
  fetchAtendimentosComMetricas,
  fetchDistinctTiposCliente,
  fetchDistinctAtendentesConversas,
} from "@/services/api";
import { resolvePeriodo, type PeriodoPreset } from "@/lib/dateRanges";
import { formatDuration } from "@/lib/formatDuration";
import { formatDurationFromMinutes as formatMin } from "@/lib/formatDuration";
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

type RankingCampo = "total_atendimentos" | "tfr_medio" | "tempo_resolucao_medio" | "csat_medio" | "total_avaliacoes";

export default function Performance() {
  useRealtimeConversas();
  const { isAdmin } = useAuth();
  const podeVer = isAdmin;

  const [aba, setAba] = useState<"ranking" | "atendimentos">("ranking");
  const [preset, setPreset] = useState<PeriodoPreset>("30dias");
  const [personalizado, setPersonalizado] = useState({ inicio: "", fim: "" });
  const [canal, setCanal] = useState("");
  const [status, setStatus] = useState("");

  const [busca, setBusca] = useState("");
  const [tipoCliente, setTipoCliente] = useState("");
  const [atendenteNome, setAtendenteNome] = useState("");
  const [page, setPage] = useState(0);
  const [ordenarPor, setOrdenarPor] = useState<OrdenarCampo | undefined>(undefined);
  const [direcao, setDirecao] = useState<"asc" | "desc">("desc");

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

  const rankingOrdenado = useMemo(() => {
    if (!ranking || !rankingOrdenarPor) return ranking;
    const copia = [...ranking];
    copia.sort((a, b) => {
      const av = a[rankingOrdenarPor] ?? -Infinity;
      const bv = b[rankingOrdenarPor] ?? -Infinity;
      return rankingDirecao === "asc" ? av - bv : bv - av;
    });
    return copia;
  }, [ranking, rankingOrdenarPor, rankingDirecao]);

  const { data: notasBaixas } = useQuery({
    queryKey: ["conversas-nota-baixa", inicio, fim],
    queryFn: () => fetchConversasNotaBaixa(inicio, fim, 2),
    enabled: podeVer && aba === "ranking",
  });

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
        <p className="text-sm text-ink/50">Você não tem a permissão "Analytics" para ver a Performance do time.</p>
      </Card>
    );
  }

  const destaque = ranking?.[0];
  const totalPages = atendimentos ? Math.ceil(atendimentos.count / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-display text-ink">Performance</h1>
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
            options={[["ranking", "Ranking"], ["atendimentos", "Atendimentos"]] as const}
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

          {isLoading ? (
            <p className="text-sm text-ink/50">Carregando...</p>
          ) : !ranking || ranking.length === 0 ? (
            <p className="text-sm text-ink/50">Sem atendimentos neste período/filtro.</p>
          ) : (
            <>
              {destaque && (
                <Card className="flex items-center gap-3 border-amber-400/40 bg-amber-500/5 p-4">
                  <Trophy size={20} className="text-amber-500" />
                  <div>
                    <p className="text-sm font-medium text-ink">Destaque em volume: {destaque.operator_nome}</p>
                    <p className="text-xs text-ink/50">{destaque.total_atendimentos} atendimentos · CSAT {destaque.csat_medio?.toFixed(1) ?? "—"}</p>
                  </div>
                </Card>
              )}
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
                    <tr>
                      <th className="px-4 py-3 font-medium">Atendente</th>
                      <SortableHeader field="total_atendimentos" label="Total de atendimentos" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                      <SortableHeader field="tfr_medio" label="TFR médio" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                      <SortableHeader field="tempo_resolucao_medio" label="Tempo médio de resolução" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                      <SortableHeader field="csat_medio" label="CSAT médio" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                      <SortableHeader field="total_avaliacoes" label="Avaliações" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                    </tr>
                  </thead>
                  <tbody>
                    {(rankingOrdenado ?? []).map((r) => (
                      <tr key={r.operator_email ?? r.operator_nome} className="border-t border-sand-line">
                        <td className="px-4 py-3 font-medium text-ink">{r.operator_nome}</td>
                        <td className="px-4 py-3 text-ink/70">{r.total_atendimentos}</td>
                        <td className="px-4 py-3 text-ink/70">{formatMin(r.tfr_medio)}</td>
                        <td className="px-4 py-3 text-ink/70">{formatMin(r.tempo_resolucao_medio)}</td>
                        <td className="px-4 py-3">{r.csat_medio?.toFixed(1) ?? "—"}</td>
                        <td className="px-4 py-3 text-ink/70">{r.total_avaliacoes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}

          <div>
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Conversas com nota baixa (CSAT ≤ 2)</h2>
            {!notasBaixas || notasBaixas.length === 0 ? (
              <Card className="flex items-start gap-3 p-4">
                <AlertTriangle size={16} className="mt-0.5 text-ink/40" />
                <p className="text-sm text-ink/50">
                  Nenhuma avaliação com nota ≤ 2 neste período/filtro — sinal bom, não é um problema de dado.
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {notasBaixas.map((n) => (
                  <Card key={n.id} className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">{n.cliente_nome} · {n.operator_nome}</span>
                      <div className="flex items-center gap-2">
                        <Badge tone="danger">Nota {n.nota}</Badge>
                        {n.link_chamado && (
                          <a href={n.link_chamado} target="_blank" rel="noreferrer">
                            <Button variant="secondary" size="sm">
                              <ExternalLink size={13} /> Ver chamado
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-ink/50">{n.canal} · {n.topico}</p>
                    {n.comentario && <p className="mt-1 text-sm text-ink/70">{n.comentario}</p>}
                  </Card>
                ))}
              </div>
            )}
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
                  <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
                    <tr>
                      <th className="px-4 py-3 font-medium">Cliente</th>
                      <th className="px-4 py-3 font-medium">Atendente</th>
                      <SortableHeader field="tempo_aberto" label="Início" ordenarPor={ordenarPor} direcao={direcao} onSort={ordenarPorColuna} />
                      <th className="px-4 py-3 font-medium">1ª resposta humana</th>
                      <SortableHeader field="tfr" label="Tempo até 1ª resposta" ordenarPor={ordenarPor} direcao={direcao} onSort={ordenarPorColuna} />
                      <SortableHeader field="tempo_resolucao" label="Resolução" ordenarPor={ordenarPor} direcao={direcao} onSort={ordenarPorColuna} className="hidden lg:table-cell" />
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atendimentos.rows.map((c) => {
                      const invalido = c.invalido_resposta_antes_inicio || c.invalido_tempo_negativo;
                      return (
                        <tr key={c.id} className={"border-t border-sand-line align-top " + (invalido ? "bg-rust-500/5" : "")}>
                          <td className="truncate px-4 py-3">
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
                              <span title="Dado inconsistente: resposta antes do início ou tempo negativo" className="flex items-center gap-1 text-xs text-rust-500">
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
                          <td className="px-4 py-3 text-right">
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
