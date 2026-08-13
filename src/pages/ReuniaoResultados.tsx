import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/Card";
import { Kpi } from "@/components/ui/Kpi";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/contexts/AuthContext";
import { fetchCsatForUser, fetchRRHistory, insertRRHistory } from "@/services/api";

function ultimosPeriodos(n: number) {
  const hoje = new Date();
  return Array.from({ length: n }).map((_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const id = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return { id, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });
}

function agregarPorMes(csat: { data_hora: string; nota: number | null }[], periodoId: string) {
  const rows = csat.filter((c) => c.data_hora.slice(0, 7) === periodoId && c.nota !== null);
  const media = rows.length
    ? rows.reduce((acc, r) => acc + (r.nota ?? 0), 0) / rows.length
    : 0;
  return { media, total: rows.length };
}

const rrSchema = z.object({
  aprendizados: z.string().min(1, "Descreva os aprendizados do período"),
  dificuldades: z.string().min(1, "Descreva as dificuldades enfrentadas"),
  planoDeAcao: z.string().min(1, "Defina o plano de ação"),
  objetivos: z.string().min(1, "Defina os objetivos do próximo período"),
});

type RRForm = z.infer<typeof rrSchema>;

export default function ReuniaoResultados() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const periodos = useMemo(() => ultimosPeriodos(6), []);
  const [periodo, setPeriodo] = useState(periodos[0].id);
  const [salvo, setSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvarErro, setSalvarErro] = useState<string | null>(null);

  const { data: csat, isLoading: loadingCsat } = useQuery({
    queryKey: ["csat", user?.id],
    queryFn: () => fetchCsatForUser(user!.email),
    enabled: Boolean(user?.id),
  });

  const { data: historico } = useQuery({
    queryKey: ["rr-history", user?.id],
    queryFn: () => fetchRRHistory(user!.id),
    enabled: Boolean(user?.id),
  });

  const atual = useMemo(() => agregarPorMes(csat ?? [], periodo), [csat, periodo]);
  const anteriorId = useMemo(() => {
    const [ano, mes] = periodo.split("-").map(Number);
    const d = new Date(ano, mes - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, [periodo]);
  const anterior = useMemo(() => agregarPorMes(csat ?? [], anteriorId), [csat, anteriorId]);

  const csatDelta = anterior.media ? ((atual.media - anterior.media) / anterior.media) * 100 : 0;
  const atendimentosDelta = anterior.total
    ? ((atual.total - anterior.total) / anterior.total) * 100
    : 0;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RRForm>({ resolver: zodResolver(rrSchema) });

  async function onSubmit(data: RRForm) {
    if (!user) return;
    setSalvando(true);
    setSalvarErro(null);
    try {
      await insertRRHistory({
        user_id: user.id,
        periodo: periodos.find((p) => p.id === periodo)?.label ?? periodo,
        csat: Number(atual.media.toFixed(2)),
        csat_variacao: Number(csatDelta.toFixed(1)),
        atendimentos: atual.total,
        atendimentos_variacao: Number(atendimentosDelta.toFixed(1)),
        tempo_medio: null,
        tempo_medio_variacao: null,
        meta_batida: atual.media >= 4.5,
        aprendizados: data.aprendizados,
        dificuldades: data.dificuldades,
        plano_de_acao: data.planoDeAcao,
        objetivos: data.objetivos,
      });
      setSalvo(true);
      reset();
      queryClient.invalidateQueries({ queryKey: ["rr-history", user.id] });
    } catch (err) {
      setSalvarErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-display text-ink">
            Reunião de Resultados
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Selecione o período. CSAT e volume de atendimentos são calculados
            automaticamente a partir dos seus registros no banco.
          </p>
        </div>
        <select
          value={periodo}
          onChange={(e) => {
            setPeriodo(e.target.value);
            setSalvo(false);
          }}
          className="h-10 rounded-xl border border-sand-line bg-white px-3 text-sm"
        >
          {periodos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Kpi
          label="CSAT do período"
          value={loadingCsat ? "..." : atual.media.toFixed(1)}
          delta={anterior.total ? csatDelta : undefined}
        />
        <Kpi
          label="Atendimentos avaliados"
          value={loadingCsat ? "..." : String(atual.total)}
          delta={anterior.total ? atendimentosDelta : undefined}
        />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-ink">
            Resultado da meta do período
          </h2>
          <Badge tone={atual.media >= 4.5 ? "success" : "danger"}>
            {atual.media >= 4.5 ? "Meta batida (CSAT ≥ 4.5)" : "Meta não atingida"}
          </Badge>
        </div>
        <p className="mt-2 text-xs text-ink/50">
          Tempo médio de atendimento ainda não é registrado no schema atual —
          reservado para quando a integração com o Crisp estiver ativa.
        </p>
      </Card>

      <Card>
        <div className="p-5 pb-0">
          <h2 className="font-display text-sm font-semibold text-ink">
            Preenchimento manual
          </h2>
          <p className="mt-1 text-sm text-ink/60">
            Estes campos não são calculados automaticamente — refletem sua análise qualitativa do período.
          </p>
        </div>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {(
              [
                ["aprendizados", "Aprendizados"],
                ["dificuldades", "Dificuldades"],
                ["planoDeAcao", "Plano de ação"],
                ["objetivos", "Objetivos para o próximo período"],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <label className="mb-1 block text-sm font-medium text-ink">
                  {label}
                </label>
                <textarea
                  {...register(field)}
                  rows={3}
                  className="w-full rounded-xl border border-sand-line bg-white p-3 text-sm outline-none focus:border-forest-500"
                  placeholder={`Descreva ${label.toLowerCase()}...`}
                />
                {errors[field] && (
                  <p className="mt-1 text-xs text-rust-500">
                    {errors[field]?.message}
                  </p>
                )}
              </div>
            ))}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar Reunião de Resultados"}
              </Button>
              {salvo && (
                <span className="text-sm text-forest-600">Salvo com sucesso.</span>
              )}
              {salvarErro && (
                <span className="text-sm text-rust-500">{salvarErro}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-ink">
          Histórico de RRs
        </h2>
        {!historico || historico.length === 0 ? (
          <p className="text-sm text-ink/50">Nenhuma RR registrada ainda.</p>
        ) : (
          <div className="space-y-3">
            {historico.map((rr) => (
              <Card key={rr.id} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{rr.periodo}</span>
                  <span className="text-xs text-ink/50">
                    CSAT {rr.csat ?? "—"} · {rr.atendimentos ?? 0} atendimentos
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
