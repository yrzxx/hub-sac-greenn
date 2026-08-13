# ROADMAP.md — Hub SAC Greenn

> Levantamento de TODOs, funcionalidades parcialmente implementadas, código
> morto e pendências, organizado por prioridade. Baseado em análise estática
> do código-fonte (grep de uso de cada export, comparação entre o que o
> `README.md` descreve como entregue e o que de fato está importado nas
> páginas) — não houve execução do app nem consulta ao schema real do
> Supabase, então alguns itens podem precisar de confirmação com o time
> antes de agir. Nenhuma alteração de código foi feita ao gerar este
> documento.

Legenda de origem de cada achado:
- **[Verificado por grep]** — confirmado por busca estática (uso = 0 em
  todo o `src/`, ou comparação direta entre README e código).
- **[Documentado no README]** — o próprio README do projeto já registra o
  item como pendência ou limitação conhecida.

---

## Prioridade Alta

Itens que afetam a confiabilidade de dados exibidos ao usuário, ou onde a
documentação do produto (README) afirma que algo está "entregue" mas o
código não confirma isso — risco de o time achar que uma funcionalidade
existe quando na prática não está visível em lugar nenhum da UI.

### 1. Dashboard de atendimento da Home descrito no README não está na tela
**[Verificado por grep]**

O README (seção "`crisp_conversations` como fonte principal de
atendimento") descreve que a Home ganhou "5 novos cards (Total de
conversas, Conversas resolvidas, TFR médio, Tempo médio de resolução,
CSAT médio) + gráfico de evolução diária", calculados por
`dashboard_atendimento_summary()` e `conversas_evolucao()`.

Na prática, [`src/pages/Home.tsx`](src/pages/Home.tsx) importa apenas
`fetchAnnouncements` e `fetchMissionProgress` — não há nenhum card de
atendimento, nem gráfico de evolução. As funções correspondentes existem
em `services/api.ts` mas **não são chamadas em nenhum lugar do código**:
- `fetchDashboardAtendimentoSummary` (`src/services/api.ts:748`)
- `fetchConversasEvolucao` (`src/services/api.ts:760`)
- `fetchDistribuicaoCanalConversas` (`src/services/api.ts:801`)
- `fetchDistribuicaoStatusConversas` (`src/services/api.ts:810`)

**Ação sugerida**: decidir se a intenção é (a) reimplementar os cards na
Home usando essas funções já prontas, ou (b) remover as funções mortas e
corrigir o README para não descrever uma tela que não existe. Qualquer que
seja a decisão, hoje há uma divergência real entre documentação e produto.

### 2. CRUD "completo" de Módulos, Perfis e Helpdesks não tem exclusão na UI
**[Verificado por grep]**

O README descreve a consolidação administrativa como CRUD completo para
Módulos e Perfis. `deleteModule`, `deleteRole` e `deleteHelpdesk` existem
em `services/api.ts` mas não são chamados por nenhuma página:
- `deleteModule` (`src/services/api.ts:307`) — sem botão de excluir em
  [`AdminModulos.tsx`](src/pages/admin/AdminModulos.tsx) (só tem "Novo
  módulo" e edição via ícone de lápis).
- `deleteRole` (`src/services/api.ts:318`) — sem botão de excluir em
  [`AdminPerfis.tsx`](src/pages/admin/AdminPerfis.tsx).
- `deleteHelpdesk` (`src/services/api.ts:958`) — sem botão de excluir em
  [`Helpdesks.tsx`](src/pages/Helpdesks.tsx).

**Ação sugerida**: adicionar o botão/ação de exclusão nessas três telas
(padrão já existe em `AdminUsuarios.tsx`, `AdminOutrosLinks.tsx` etc — é
só replicar), ou remover as funções se a exclusão for uma decisão
consciente de não permitir (nesse caso, documentar o motivo).

### 3. `csat_results.tempo_*` continua 100% nulo — dependência de integração ainda não resolvida
**[Documentado no README]**

O README confirma que `tempo_primeira_resposta_seg`/
`tempo_encerramento_seg` em `csat_results` nunca são preenchidos pelo n8n.
Várias telas já migraram para usar `crisp_conversations` como fonte real
de tempo, mas [`ReuniaoResultados.tsx`](src/pages/ReuniaoResultados.tsx:162)
ainda mostra o aviso "Tempo médio de atendimento ainda não é registrado no
schema atual — reservado para quando a integração com o Crisp estiver
ativa", apesar de `crisp_conversations` já estar em produção e sendo usada
em Analytics/Performance/Meu Painel.

**Ação sugerida**: avaliar se Reunião de Resultados também deve passar a
usar `crisp_conversations` para tempo médio, como já foi feito nas outras
telas — hoje há inconsistência entre módulos que usam a mesma métrica.

### 4. Vínculo `email_atendente`/`operator_email` é frágil e não documentado no schema (sem FK)
**[Documentado no README, agravado por achado de código]**

O vínculo real entre `csat_results`/`crisp_conversations` e `users` é por
e-mail em texto livre, não por chave estrangeira. Isso já causou dados
"silenciosamente vazios" no passado (ranking, dashboards) por depender de
`user_id`, que nunca é populado. Não há validação de formato/normalização
de e-mail (case, espaços) em nenhuma das funções de `api.ts` que fazem
esse cruzamento (`fetchCsatForUser`, `fetchDistinctOperadores`,
`fetchAtendentePerformance` etc.).

**Ação sugerida**: confirmar no banco se existe normalização
(`lower(trim(email))`) nas funções SQL usadas para esse cruzamento; se
não existir, um e-mail com capitalização diferente no Crisp vs. em
`users.email` volta a quebrar o vínculo silenciosamente, como já
aconteceu.

---

## Prioridade Média

Código morto de baixo risco, inconsistências de UI e decisões pendentes já
sinalizadas pelo próprio time, mas sem impacto imediato em dado exibido
incorretamente.

### 5. Funções de API duplicadas/obsoletas em `services/api.ts`
**[Verificado por grep]**

Funções exportadas sem nenhum import em todo o `src/` (confirmado por
`grep -rn` de cada nome, excluindo a própria definição):

| Função | Linha | Provável substituta em uso |
|---|---|---|
| `fetchMissions` | `api.ts:197` | `fetchAllMissions` (`api.ts:208`) |
| `fetchTeamRanking` | `api.ts:395` | `fetchTeamRankingFiltered` (também não usada — ver abaixo) |
| `fetchTeamRankingFiltered` | `api.ts:531` | `fetchOperadorRanking` (`api.ts:576`, usada em Analytics) |
| `fetchCsatTeamAverage` | `api.ts:255` | `fetchAnalyticsSummary` (`api.ts:504`) |
| `fetchTeamCsatMonthly` | `api.ts:263` | `fetchAnalyticsEvolucao` (`api.ts:516`) |
| `fetchCsatTempoRespostaCorrelacao` | `api.ts:819` | — (README já registra que essa análise aparece vazia; ver item 8) |

**Ação sugerida**: remover essas seis funções se confirmado que não há
plano de reativá-las, ou documentar por que ficam reservadas (seguindo o
padrão já usado para `crisp_ratings`/`analytics_sac`).

### 6. Componente `SegmentedControl` implementado e nunca usado
**[Verificado por grep]**

[`src/components/ui/SegmentedControl.tsx`](src/components/ui/SegmentedControl.tsx)
existe, está exportado, e o próprio comentário no arquivo diz que foi
criado para "substituir os antigos botões-pill grandes e espaçados" — mas
não há nenhum import dele em nenhuma página. Telas que hoje usam seletor
de granularidade (ex: diária/semanal/mensal em Analytics) parecem
implementar o próprio controle inline em vez de usar este componente.

**Ação sugerida**: ou adotar `SegmentedControl` nos lugares que hoje têm
esse padrão duplicado inline (reduz código), ou remover o componente se a
decisão foi não usá-lo.

### 7. `src/types/index.ts` majoritariamente morto — resquício da fase mockData
**[Verificado por grep]**

De todos os tipos exportados em `types/index.ts`, só `AppUser`/`UserRole`
são de fato importados em código (`AuthContext.tsx`, único ponto que
importa de `@/types`). Estão sem nenhum uso fora do próprio arquivo:
`Kpi` (interface, não confundir com o componente `components/ui/Kpi.tsx`,
que é usado e não tem relação), `Announcement`, `Mission`, `Tool`,
`Course`, `DocItem`, `RRHistorico`. `UserStatus` só é usado dentro do
próprio `AppUser`.

Esses tipos correspondem à fase anterior do projeto, quando a aplicação
rodava sobre `src/lib/mockData.ts` (mencionado no README, mas o arquivo
já não existe mais no repositório) — o app migrou para os tipos `Db*` de
`types/database.ts` e esses tipos de UI ficaram para trás.

**Ação sugerida**: remover os tipos não utilizados de `types/index.ts`
(manter só `AppUser`/`UserRole`/`UserStatus`), atualizando o README na
próxima revisão para não referenciar mais `mockData.ts`.

### 8. `fetchCsatTempoRespostaCorrelacao` e correlação CSAT↔Conversa por `crisp_id`
**[Documentado no README + verificado por grep]**

O README explicita que essa correlação foi implementada corretamente mas
"como `csat_results.crisp_id` está 100% nulo no pipeline atual, essas duas
análises aparecem vazias com uma mensagem explicando o motivo". Hoje,
porém, `fetchCsatTempoRespostaCorrelacao` não é chamada em nenhuma tela —
ou essa "mensagem explicando o motivo" já foi removida da UI numa
simplificação posterior sem atualizar o README, ou a função está morta e
esquecida.

**Ação sugerida**: confirmar se a intenção é reativar essa correlação
quando `crisp_id` passar a ser preenchido, e nesse caso deixar a função
(está OK ficar reservada, como outras partes do schema) — mas registrar
isso explicitamente em vez de deixar como código órfão silencioso.

### 9. Padrão de modal duplicado manualmente em cada página com CRUD
**[Verificado por grep — observação estrutural, não achado de uso zero]**

Não existe um componente `<Dialog>`/`<Modal>` genérico — o markup
`fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4` +
`<Card className="w-full max-w-md p-5 shadow-float">` é replicado
manualmente em pelo menos 10 páginas (`AdminUsuarios`, `AdminModulos`,
`AdminPerfis`, `AdminCursos`, `AdminDocumentacao`, `AdminAtualizacoes`,
`AdminOutrosLinks`, `Missoes`, `ReclameAqui`, `Nps`, entre outras).

**Ação sugerida**: não é um bug, mas é uma boa oportunidade de extrair um
componente `Dialog` reutilizável em `components/ui/` — reduziria
duplicação e centralizaria acessibilidade (hoje nenhum desses modais
parece tratar foco/Escape/`aria-modal`, ver item 12).

### 10. Decisão pendente: `nps_responses` vs. `nps_followups`
**[Documentado no README]**

O README registra explicitamente que existe uma tabela paralela
`nps_followups` (real, mas vazia) e pede para "definir com o time qual das
duas deve ser a fonte definitiva quando a integração existir". Hoje o
código usa só `nps_responses`.

**Ação sugerida**: decisão de produto/dados, não de código — sinalizar
para o time antes de qualquer integração real de NPS ser construída.

### 11. Reclame Aqui e NPS seguem sobre dados de exemplo, sem integração real
**[Documentado no README]**

Ambos os módulos têm tela e schema prontos, mas populados com dados
fictícios de demonstração — não existe integração n8n para HugMe/Reclame
Aqui nem para NPS ainda.

**Ação sugerida**: ao integrar de fato, revisar se os dados de exemplo
precisam ser removidos das tabelas de produção antes de ativar a
integração real (mesmo cuidado do incidente de dados fictícios já
documentado para `csat_results`).

---

## Prioridade Baixa

Itens de organização, polimento e limpeza sem risco funcional.

### 12. Modais sem tratamento explícito de acessibilidade
**[Verificado por grep — observação, não medição exaustiva]**

Os modais manuais (ver item 9) não usam `<dialog>` nativo nem uma
biblioteca de a11y — não há indício de gerenciamento de foco ao abrir,
fechamento por tecla Escape, ou `role="dialog"`/`aria-modal="true"` nos
componentes inspecionados (`AdminUsuarios.tsx` como amostra).

**Ação sugerida**: baixa prioridade hoje (app de uso interno, público
controlado), mas vale considerar ao extrair o componente `Dialog`
sugerido no item 9.

### 13. `AdminEscalas` e Calendário: "Total do dia" é uma aproximação
**[Documentado no README]**

O próprio README já registra como "simplificação assumida": 8h para dia
útil e 4h para plantão de sábado, sem recalcular minuto a minuto a partir
da jornada detalhada configurada por usuário.

**Ação sugerida**: refinar só se o time sinalizar que a aproximação está
causando problema prático — não é um bug, é uma decisão documentada.

### 14. Horário de expediente sem diferenciar fins de semana/feriados e sem fuso horário
**[Documentado no README]**

`duracao_dentro_expediente()` aplica a mesma janela diária a todos os
dias da semana e não converte fuso horário — registrado no README como
"aproximação razoável para o estágio atual, não um cálculo de escala
trabalhista completo".

**Ação sugerida**: mesmo caso do item 13 — só revisitar mediante demanda
real do time.

### 15. `fontFamily.mono` (IBM Plex Mono) configurado no Tailwind e nunca usado
**[Verificado por grep]**

`tailwind.config.ts` define `fontFamily.mono` com IBM Plex Mono, mas
não há nenhuma classe `font-mono` usada em nenhuma página analisada.

**Ação sugerida**: remover do config se não houver plano de uso próximo,
ou ignorar — custo zero de manter.

### 16. Roadmap de escopo original explicitamente fora desta fase
**[Documentado no README]**

Itens que o README já lista como conscientemente não implementados:
- Reunião de Resultados avançada: comparação semana×semana, exportar PDF,
  copiar relatório.
- Sistema de Tags em Documentação (categorias e tags ficaram de fora da
  consolidação administrativa).
- Analytics: comparativos adicionais e cache de analytics
  (`analytics_cache`).

**Ação sugerida**: nenhuma ação imediata — são backlog de produto, não
bugs. Mantidos aqui só para centralizar tudo que está pendente em um
único documento, complementando a seção "Roadmap" do README.

---

## Metodologia e limitações desta análise

- Cobertura: toda a árvore `src/` foi inspecionada por leitura direta dos
  arquivos centrais (`App.tsx`, `AuthContext.tsx`, `services/api.ts`
  completo, `types/database.ts`, `types/index.ts`, todos os componentes de
  `components/ui/`, hooks de Realtime, rotas/guards) e por busca de uso
  (`grep -rn`) de cada função exportada em `services/api.ts`, cada
  componente de `components/ui/`, e cada tipo de `types/index.ts`.
- Não foi executado `npm run build`/`tsc`/`eslint` para confirmar erros de
  compilação ou lint — os achados acima são sobre uso morto/ausente, não
  sobre erros de tipo.
- Não houve acesso ao schema real do Supabase (sem MCP/CLI do Supabase
  configurado nesta sessão) — qualquer afirmação sobre o banco vem do que
  está documentado no `README.md` do projeto ou refletido nos tipos
  `Db*`, não de uma consulta direta ao Postgres.
- "Não utilizado" significa "sem nenhum import/chamada em `src/`
  detectado por busca textual" — não descarta uso via string dinâmica
  (nenhum caso desses foi identificado nas funções listadas, mas vale
  reconferir antes de excluir código).
