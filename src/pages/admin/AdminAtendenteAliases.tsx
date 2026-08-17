import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchAtendenteAliases, upsertAtendenteAlias, deleteAtendenteAlias, type DbAtendenteAlias } from "@/services/api";

const schema = z.object({
  email_variante: z.string().email("Informe um e-mail válido"),
  email_canonico: z.string().email("Informe um e-mail válido"),
  nome_canonico: z.string().min(1, "Informe o nome completo"),
});
type FormT = z.infer<typeof schema>;

export default function AdminAtendenteAliases() {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<DbAtendenteAlias | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { data: aliases, isLoading } = useQuery({ queryKey: ["atendente-aliases"], queryFn: fetchAtendenteAliases });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormT>({ resolver: zodResolver(schema) });

  function abrirNovo() {
    setEditando(null); setErro(null);
    reset({ email_variante: "", email_canonico: "", nome_canonico: "" });
    setDialogAberto(true);
  }
  function abrirEdicao(a: DbAtendenteAlias) {
    setEditando(a); setErro(null);
    reset({ email_variante: a.email_variante, email_canonico: a.email_canonico, nome_canonico: a.nome_canonico });
    setDialogAberto(true);
  }
  async function onSubmit(data: FormT) {
    setSalvando(true); setErro(null);
    try {
      await upsertAtendenteAlias({ ...(editando ? { id: editando.id } : {}), ...data });
      await queryClient.invalidateQueries({ queryKey: ["atendente-aliases"] });
      setDialogAberto(false);
    } catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível salvar."); }
    finally { setSalvando(false); }
  }

  async function remover(a: DbAtendenteAlias) {
    if (!confirm(`Remover o alias "${a.email_variante}"?`)) return;
    setErro(null);
    try {
      await deleteAtendenteAlias(a.id);
      await queryClient.invalidateQueries({ queryKey: ["atendente-aliases"] });
    } catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível excluir."); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-sand-line bg-sand-bg/60 p-4">
        <Users size={18} className="mt-0.5 text-forest-600" />
        <p className="text-sm text-ink/60">
          O Crisp às vezes registra o mesmo atendente com e-mails ou nomes
          diferentes (variação de conta, apelido vs. nome completo). Cadastre
          aqui qual e-mail/nome "de variante" deve ser tratado como o mesmo
          colaborador no dashboard de CSAT — cada e-mail variante aponta para
          um e-mail e nome canônicos únicos.
        </p>
      </div>
      <div className="flex justify-end">
        <Button onClick={abrirNovo}><Plus size={16} /> Novo alias</Button>
      </div>
      {erro && <p className="text-sm text-rust-500">{erro}</p>}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : !aliases || aliases.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum alias cadastrado"
          description="Cadastre um alias quando notar o mesmo atendente aparecendo duplicado no CSAT."
          action={<Button onClick={abrirNovo}>Novo alias</Button>}
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3 font-medium">E-mail variante</th>
                <th className="px-4 py-3 font-medium">E-mail canônico</th>
                <th className="px-4 py-3 font-medium">Nome canônico</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {aliases.map((a) => (
                <tr key={a.id} className="border-t border-sand-line">
                  <td className="px-4 py-3 text-ink/70">{a.email_variante}</td>
                  <td className="px-4 py-3 text-ink/70">{a.email_canonico}</td>
                  <td className="px-4 py-3 font-medium text-ink">{a.nome_canonico}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => abrirEdicao(a)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-sand-bg hover:text-ink"><Pencil size={15} /></button>
                      <button onClick={() => remover(a)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-rust-500/10 hover:text-rust-500"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {dialogAberto && (
        <Dialog onClose={() => setDialogAberto(false)}>
          <h2 className="font-display text-base font-semibold text-ink">{editando ? "Editar alias" : "Novo alias"}</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/70">E-mail variante (como aparece duplicado)</label>
              <input {...register("email_variante")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
              {errors.email_variante && <p className="mt-1 text-xs text-rust-500">{errors.email_variante.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/70">E-mail canônico (correto)</label>
              <input {...register("email_canonico")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
              {errors.email_canonico && <p className="mt-1 text-xs text-rust-500">{errors.email_canonico.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/70">Nome canônico</label>
              <input {...register("nome_canonico")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
              {errors.nome_canonico && <p className="mt-1 text-xs text-rust-500">{errors.nome_canonico.message}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setDialogAberto(false)}>Cancelar</Button>
              <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
