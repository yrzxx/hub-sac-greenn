import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchMyPermissions } from "@/services/api";

/**
 * Nenhuma permissão fica fixa no frontend: a lista de módulos que o usuário
 * pode gerenciar vem sempre de public.user_permissions (via RLS). Um
 * Administrador tem acesso irrestrito por definição (is_admin() no banco).
 */
export function usePermissions() {
  const { user, isAdmin } = useAuth();

  const { data: slugs, isLoading } = useQuery({
    queryKey: ["my-permissions", user?.id],
    queryFn: () => fetchMyPermissions(user!.id),
    enabled: Boolean(user?.id) && !isAdmin,
  });

  function hasPermission(moduleSlug: string): boolean {
    if (isAdmin) return true;
    return (slugs ?? []).includes(moduleSlug);
  }

  return { hasPermission, loading: isAdmin ? false : isLoading };
}
