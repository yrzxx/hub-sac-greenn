import { useEffect, useState } from "react";

// Mesmo useState, mas lembra o último valor entre visitas via localStorage.
// Usado pra filtros de tela (período, canal, status etc.) que o usuário
// espera encontrar do jeito que deixou da última vez.
export function usePersistedState<T>(chave: string, valorInicial: T) {
  const [valor, setValor] = useState<T>(() => {
    try {
      const salvo = localStorage.getItem(chave);
      return salvo !== null ? (JSON.parse(salvo) as T) : valorInicial;
    } catch {
      return valorInicial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      // localStorage indisponível (modo privado, quota cheia etc.) — ignora
    }
  }, [chave, valor]);

  return [valor, setValor] as const;
}
