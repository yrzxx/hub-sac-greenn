import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { useRealtimeAnnouncementsNotifier } from "@/hooks/useRealtimeAnnouncementsNotifier";

function AppLayoutInner() {
  useRealtimeAnnouncementsNotifier();

  return (
    <div className="flex h-screen bg-sand-bg">
      <div className="fixed inset-y-0 left-0 z-30">
        <Sidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden pl-[72px]">
        <Header />
        <main className="flex-1 overflow-y-auto scrollbar-thin px-6 py-6">
          <div className="mx-auto w-full max-w-[1600px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export function AppLayout() {
  return (
    <NotificationsProvider>
      <ToastProvider>
        <AppLayoutInner />
      </ToastProvider>
    </NotificationsProvider>
  );
}
