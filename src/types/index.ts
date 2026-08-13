export type UserRole = "administrador" | "colaborador";

export type UserStatus = "ativo" | "inativo";

export interface AppUser {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  equipe: string;
  avatarUrl?: string;
  status: UserStatus;
  perfil: UserRole;
}

export interface Kpi {
  label: string;
  value: string;
  delta?: number; // percentual, positivo ou negativo
  unit?: string;
}

export interface Announcement {
  id: string;
  titulo: string;
  descricao: string;
  categoria: "aviso" | "novidade" | "manutencao" | "reconhecimento";
  prioridade: "baixa" | "media" | "alta";
  data: string;
}

export interface Mission {
  id: string;
  titulo: string;
  descricao: string;
  progresso: number; // 0-100
  meta: number;
  atual: number;
  unidade: string;
  prazo: string;
}

export interface Tool {
  id: string;
  nome: string;
  descricao: string;
  url: string;
  categoria: string;
}

export interface Course {
  id: string;
  titulo: string;
  descricao: string;
  categoria: string;
  progresso: number;
  cargaHoraria: string;
}

export interface DocItem {
  id: string;
  titulo: string;
  categoria: string;
  atualizadoEm: string;
}

export interface RRHistorico {
  id: string;
  periodo: string;
  csat: number;
  csatVariacao: number;
  atendimentos: number;
  atendimentosVariacao: number;
  tempoMedio: string;
  tempoMedioVariacao: number;
  aprendizados: string;
  dificuldades: string;
  planoDeAcao: string;
}
