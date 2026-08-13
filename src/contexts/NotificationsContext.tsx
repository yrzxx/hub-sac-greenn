import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface NotificationsContextValue {
  unreadCount: number;
  unreadGerais: number;
  unreadMissoes: number;
  registrarNovaAtualizacao: (categoria: string | null) => void;
  marcarComoLidas: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [unreadGerais, setUnreadGerais] = useState(0);
  const [unreadMissoes, setUnreadMissoes] = useState(0);

  const registrarNovaAtualizacao = useCallback((categoria: string | null) => {
    if (categoria === "missao") setUnreadMissoes((c) => c + 1);
    else setUnreadGerais((c) => c + 1);
  }, []);

  const marcarComoLidas = useCallback(() => {
    setUnreadGerais(0);
    setUnreadMissoes(0);
  }, []);

  return (
    <NotificationsContext.Provider
      value={{
        unreadCount: unreadGerais + unreadMissoes,
        unreadGerais,
        unreadMissoes,
        registrarNovaAtualizacao,
        marcarComoLidas,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications precisa estar dentro de <NotificationsProvider>");
  return ctx;
}
