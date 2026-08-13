import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Leaf } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function Login() {
  const { user, login, loading, error: profileError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setLoginError(null);
    try {
      await login(email, password);
    } catch (err) {
      setLoginError(
        err instanceof Error ? err.message : "Não foi possível entrar."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-bg px-4">
      <Card className="w-full max-w-sm p-6 shadow-float">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest-500 text-white">
            <Leaf size={18} />
          </div>
          <span className="font-display text-base font-semibold text-ink">
            Hub SAC Greenn
          </span>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-sm outline-none focus:border-forest-500"
              placeholder="voce@greenn.com.br"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              Senha
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-sm outline-none focus:border-forest-500"
              placeholder="••••••••"
            />
          </div>

          {(loginError || profileError) && (
            <p className="text-sm text-rust-500">{loginError ?? profileError}</p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Entrando..." : "Entrar"}
          </Button>
        </form>

        <p className="mt-4 text-xs text-ink/50">
          Seu acesso é criado pelo Administrador do Hub. Caso não tenha uma
          conta ainda, fale com o time de gestão.
        </p>
      </Card>
    </div>
  );
}
