import { Navigate, Outlet } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * Uso: <Route element={<RequirePermission slug="reclame_aqui" />}>...
 * Administradores sempre passam (is_admin() no banco cobre tudo).
 * Para qualquer outro usuário, a rota só libera se existir uma linha em
 * public.user_permissions para o módulo correspondente.
 */
export function RequirePermission({ slug }: { slug: string }) {
  const { hasPermission, loading } = usePermissions();

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-ink/50">
        Verificando permissão...
      </div>
    );
  }

  if (!hasPermission(slug)) return <Navigate to="/" replace />;

  return <Outlet />;
}
