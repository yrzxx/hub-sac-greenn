import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, LayoutGrid } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchModules, upsertModule } from "@/services/api";
import type { DbModule } from "@/types/database";

const schema = z.object({
  nome: z.string().min(1, "Informe o nome"),
  rota: z.string().optional(),
  slug: z.string().min(1, "Informe o slug (usado nas permissões)"),
  categoria: z.string().optional(),
  ordem: z.coerce.number().int().min(0),
  mostrar_sidebar: z.boolean(),
  mostrar_home: z.boolean(),
});
type FormT = z.infer<typeof schema>;

export default function AdminModulos() {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<DbModule | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { data: modulos, isLoading } = useQuery({ queryKey: ["modules"], queryFn: fetchModules });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormT>({ resolver: zodResolver(schema) });

  function abrirNovo() {
    setEditando(null); setErro(null);
    reset({ nome: "", rota: "", slug: "", categoria: "", ordem: (modulos?.length ?? 0) + 1, mostrar_sidebar: true, mostrar_home: false });
    setDialogAberto(true);
  }
  function abrirEdicao(m: DbModule) {
    setEditando(m); setErro(null);
    reset({ nome: m.nome, rota: m.rota ?? "", slug: m.slug ?? "", categoria: m.categoria ?? "", ordem: m.ordem, mostrar_sidebar: m.mostrar_sidebar, mostrar_home: m.mostrar_home });
    setDialogAberto(true);
  }
  async function onSubmit(data: FormT) {
    setSalvando(true); setErro(null);
    try {
      await upsertModule({ ...(editando ? { id: editando.id } : {}), ...data });
      await queryClient.invalidateQueries({ queryKey: ["modules"] });
      setDialogAberto(false);
    } catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível salvar."); }
    finally { setSalvando(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-sand-line bg-sand-bg/60 p-4">
        <LayoutGrid size={18} className="mt-0.5 text-forest-600" />
        <p className="text-sm text-ink/60">
          O <code>slug</code> de cada módulo é a chave usada pelo sistema de permissões
          granulares (Administração → Permissões). Alterar um slug existente pode
          quebrar permissões já concedidas — prefira criar um novo módulo em vez de
          renomear o slug de um em uso.
        </p>
      </div>
      <div className="flex justify-end">
        <Button onClick={abrirNovo}><Plus size={16} /> Novo módulo</Button>
      </div>
      {erro && <p className="text-sm text-rust-500">{erro}</p>}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : !modulos || modulos.length === 0 ? (
        <EmptyState icon={LayoutGrid} title="Nenhum módulo cadastrado" description="Cadastre o primeiro módulo." action={<Button onClick={abrirNovo}>Novo módulo</Button>} />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
              <tr><th className="px-4 py-3 font-medium">Módulo</th><th className="px-4 py-3 font-medium">Slug</th><th className="px-4 py-3 font-medium">Rota</th><th className="px-4 py-3 font-medium">Sidebar</th><th className="px-4 py-3 font-medium">Home</th><th className="px-4 py-3 font-medium text-right">Ações</th></tr>
            </thead>
            <tbody>
              {modulos.map((m) => (
                <tr key={m.id} className="border-t border-sand-line">
                  <td className="px-4 py-3 font-medium text-ink">{m.nome}</td>
                  <td className="px-4 py-3"><Badge tone="neutral">{m.slug}</Badge></td>
                  <td className="px-4 py-3 text-ink/70">{m.rota}</td>
                  <td className="px-4 py-3">{m.mostrar_sidebar ? "sim" : "não"}</td>
                  <td className="px-4 py-3">{m.mostrar_home ? "sim" : "não"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button onClick={() => abrirEdicao(m)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-sand-bg hover:text-ink"><Pencil size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {dialogAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <Card className="w-full max-w-md p-5 shadow-float">
            <h2 className="font-display text-base font-semibold text-ink">{editando ? "Editar módulo" : "Novo módulo"}</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Nome</label>
                <input {...register("nome")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                {errors.nome && <p className="mt-1 text-xs text-rust-500">{errors.nome.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Slug</label>
                  <input {...register("slug")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                  {errors.slug && <p className="mt-1 text-xs text-rust-500">{errors.slug.message}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Rota</label>
                  <input {...register("rota")} placeholder="/exemplo" className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Categoria</label>
                  <input {...register("categoria")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Ordem</label>
                  <input type="number" {...register("ordem")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("mostrar_sidebar")} className="h-4 w-4 accent-forest-500" /> Mostrar na sidebar</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("mostrar_home")} className="h-4 w-4 accent-forest-500" /> Mostrar na Home</label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setDialogAberto(false)}>Cancelar</Button>
                <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
