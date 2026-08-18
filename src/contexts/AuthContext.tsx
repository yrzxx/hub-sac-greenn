import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { fetchCurrentProfile, ensureOnlineStatus } from "@/services/api";
import type { AppUser, UserRole } from "@/types";
import type { DbUser } from "@/types/database";

function mapDbUserToAppUser(db: DbUser): AppUser {
  const roleName = db.roles?.nome?.toLowerCase();
  const perfil: UserRole = roleName === "administrador" ? "administrador" : "colaborador";
  return {
    id: db.id,
    nome: db.nome,
    email: db.email,
    cargo: db.cargo ?? "",
    equipe: db.equipe ?? "",
    avatarUrl: db.avatar ?? undefined,
    status: db.ativo ? "ativo" : "inativo",
    perfil,
  };
}

interface AuthContextValue {
  user: AppUser | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadProfile(session: Session | null) {
    if (!session?.user || !supabase) {
      setUser(null);
      return;
    }
    try {
      const profile = await fetchCurrentProfile(session.user.id);
      if (!profile) {
        setError(
          "Login autenticado, mas nenhum registro em public.users está vinculado a este auth_id."
        );
        setUser(null);
        return;
      }
      setUser(mapDbUserToAppUser(profile));
      setError(null);
      ensureOnlineStatus(profile.id).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar perfil.");
      setUser(null);
    }
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      loadProfile(data.session).finally(() => setLoading(false));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      loadProfile(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAdmin: user?.perfil === "administrador",
      loading,
      error,
      login: async (email, password) => {
        if (!supabase) throw new Error("Supabase não configurado.");
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) throw authError;
      },
      logout: async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
        setUser(null);
      },
      refreshUser: async () => {
        if (!supabase) return;
        const { data } = await supabase.auth.getSession();
        await loadProfile(data.session);
      },
    }),
    [user, loading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
