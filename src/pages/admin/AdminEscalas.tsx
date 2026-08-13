import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, GripVertical, CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  fetchEscalaSabado,
  upsertEscalaSabadoItem,
  removeEscalaSabadoItem,
  fetchUsers,
  fetchAtendenteEscaladoSabado,
} from "@/services/api";

function proximosSabados(qtd: number) {
  const hoje = new Date();
  const dias: Date[] = [];
  const d = new Date(hoje);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  for (let i = 0; i < qtd; i++) {
    dias.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return dias;
}

export default function AdminEscalas() {
  const queryClient = useQueryClient();
  const [novoUsuario, setNovoUsuario] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const { data: escala, isLoading } = useQuery({ queryKey: ["escala-sabado"], queryFn: fetchEscalaSabado });
  const { data: usuarios } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });

  const sabados = proximosSabados(4);
  const { data: escaladosPorSabado } = useQuery({
    queryKey: ["escalados-sabados", sabados.map((s) => s.toISOString())],
    queryFn: async () => {
      const resultados = await Promise.all(
        sabados.map((s) => fetchAtendenteEscaladoSabado(s.toISOString().slice(0, 10)))
      );
      return sabados.map((s, i) => ({ data: s, atendente: resultados[i] }));
    },
    enabled: (escala?.length ?? 0) > 0,
  });

  async function adicionar() {
    if (!novoUsuario) return;
    setErro(null);
    try {
      const proximaPosicao = (escala?.length ?? 0) + 1;
      await upsertEscalaSabadoItem(proximaPosicao, novoUsuario);
      await queryClient.invalidateQueries({ queryKey: ["escala-sabado"] });
      await queryClient.invalidateQueries({ queryKey: ["escalados-sabados"] });
      setNovoUsuario("");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível adicionar.");
    }
  }

  async function remover(id: string) {
    try {
      await removeEscalaSabadoItem(id);
      await queryClient.invalidateQueries({ queryKey: ["escala-sabado"] });
      await queryClient.invalidateQueries({ queryKey: ["escalados-sabados"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível remover.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-sand-line bg-sand-bg/60 p-4">
        <CalendarDays size={18} className="mt-0.5 text-forest-600" />
        <p className="text-sm text-ink/60">
          Sábados não têm horário fixo individual — a sequência abaixo define
          o rodízio manual de quem fica de plantão a cada sábado, calculado
          automaticamente a partir da posição de cada um na lista.
        </p>
      </div>

      {erro && <p className="text-sm text-rust-500">{erro}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-display text-sm font-semibold text-ink">Sequência de atendentes</h2>
          <Card className="overflow-hidden">
            {isLoading ? (
              <p className="p-4 text-sm text-ink/50">Carregando...</p>
            ) : !escala || escala.length === 0 ? (
              <p className="p-4 text-sm text-ink/50">Nenhum atendente na escala ainda.</p>
            ) : (
              <ul>
                {escala.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 border-t border-sand-line px-4 py-3 first:border-t-0">
                    <GripVertical size={14} className="text-ink/30" />
                    <Badge tone="neutral">#{e.posicao}</Badge>
                    <span className="flex-1 text-sm text-ink">{e.users?.nome ?? "—"}</span>
                    <button onClick={() => remover(e.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-rust-500/10 hover:text-rust-500">
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="mt-3 flex gap-2">
            <select value={novoUsuario} onChange={(e) => setNovoUsuario(e.target.value)} className="h-10 flex-1 rounded-lg border border-sand-line bg-white px-3 text-sm">
              <option value="">Selecione um colaborador...</option>
              {(usuarios ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
            <Button onClick={adicionar}><Plus size={16} /> Adicionar</Button>
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-display text-sm font-semibold text-ink">Próximos sábados</h2>
          <Card className="divide-y divide-sand-line">
            {(escaladosPorSabado ?? []).map(({ data, atendente }) => (
              <div key={data.toISOString()} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-ink/70">
                  {data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </span>
                <Badge tone={atendente ? "success" : "neutral"}>{atendente?.nome ?? "Sem escala definida"}</Badge>
              </div>
            ))}
            {(!escaladosPorSabado || escaladosPorSabado.length === 0) && (
              <p className="p-4 text-sm text-ink/50">Adicione atendentes à sequência para ver a projeção.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
