# ROADMAP.md — Hub SAC Greenn

> Levantamento de TODOs, funcionalidades parcialmente implementadas, código
> morto e pendências, organizado por prioridade. Ver `CLAUDE.md` seção 23
> para o histórico de como este documento evolui a cada rodada.

## Resolvido nesta rodada (2026-08-13)

Os itens abaixo estavam listados como pendentes e foram corrigidos:

- **Dashboard de atendimento da Home** — implementado usando as funções
  que já existiam em `services/api.ts` sem nenhuma tela consumindo
  (`fetchDashboardAtendimentoSummary`, `fetchConversasEvolucao`). Ver
  [src/pages/Home.tsx](src/pages/Home.tsx).
- **CRUD sem exclusão em Módulos/Perfis/Helpdesks** — botão de excluir
  adicionado nas três telas, usando `deleteModule`/`deleteRole`/
  `deleteHelpdesk` (que já existiam em `api.ts`). Perfis base
  (Administrador/Colaborador) são protegidos contra exclusão na UI.
- **Reunião de Resultados com tempo médio "não registrado"** — agora usa
  `fetchMinhasConversasMetricas` (mesma fonte já usada em Meu Painel) para
  mostrar tempo médio de resolução real do período.
- **6 funções mortas em `api.ts`** (`fetchMissions`, `fetchTeamRanking`,
  `fetchTeamRankingFiltered`, `fetchCsatTeamAverage`, `fetchTeamCsatMonthly`,
  `fetchCsatTempoRespostaCorrelacao`) — removidas, junto com o tipo
  `RankingRow` que só elas usavam.
- **`SegmentedControl` nunca usado** — adotado em Analytics (granularidade),
  CSAT, Atualizações e Reclame Aqui (abas internas), substituindo o markup
  de botões-pill duplicado manualmente em cada página.
- **`types/index.ts` majoritariamente morto** — removidos `Kpi`,
  `Announcement`, `Mission`, `Tool`, `Course`, `DocItem`, `RRHistorico`;
  mantidos só `AppUser`/`UserRole`/`UserStatus`, que são os únicos
  realmente importados.
- **Padrão de modal duplicado em ~11 páginas** — extraído para
  `src/components/ui/Dialog.tsx` (fecha com Escape/clique no backdrop,
  `role="dialog"`/`aria-modal`) e adotado em todos os modais da aplicação.
  Isso também resolve o item de acessibilidade de modais que estava listado
  como prioridade Baixa.
- **`fontFamily.mono` não utilizada** — removida do `tailwind.config.ts`.
- **Build de produção nunca validado** — `npm run build` (`tsc -b && vite
  build`) rodado com sucesso pela primeira vez neste projeto. Isso exigiu:
  - Node 20 (o Node 12 do sistema não roda o `tsc` instalado).
  - `npm install --legacy-peer-deps` (ver item novo abaixo).
  - Corrigir 6 hooks `useRealtime*` que capturavam `supabase` (possivelmente
    `null`) dentro do closure de cleanup do `useEffect` sem narrowing —
    `if (!supabase) return` sozinho não bastava para o TS.
  - Adicionar o campo `email` (e-mail do cliente) a `DbCsatResult` em
    `types/database.ts` — a coluna já existe de verdade no Postgres (README
    documenta isso) e já era usada em `Csat.tsx`/`MeuPainel.tsx`, mas nunca
    tinha sido refletida no tipo.
  - Remover imports não utilizados (`CardContent` em `Calendario.tsx` e
    `Nps.tsx`) e ajustar dois usos de `DynamicIcon` (`icone: string | null`
    vs. prop `string | undefined`).
  - Corrigir a inferência de tipo de `fetchMyPermissions` (o join
    `modules(slug)` do Supabase pode ser inferido como array ou objeto
    dependendo da cardinalidade do relacionamento).

## Achado novo (não resolvido, precisa de decisão)

### Conflito de versão entre `vite` e `@vitejs/plugin-react`
**[Verificado ao rodar `npm install`]**

`package.json` tem `"vite": "^8.2.1"` mas `"@vitejs/plugin-react":
"^4.3.1"`, cujo peer range aceito é `vite ^4.2.0 || ^5.0.0 || ^6.0.0 ||
^7.0.0` — não cobre a v8. `npm install` sem flags falha com `ERESOLVE`; o
projeto só instala hoje com `npm install --legacy-peer-deps` (usado para
gerar o `package-lock.json` atual). O build funciona assim na prática,
mas ninguém decidiu conscientemente ficar em vite 8 com um plugin que não
declara suporte a ela.

**Ação sugerida**: decidir entre (a) atualizar `@vitejs/plugin-react` para
uma versão que já suporte vite 8, se existir, ou (b) fixar `vite` em uma
major coberta pelo plugin (ex: `^7`). Qualquer uma resolve o `ERESOLVE` sem
precisar de `--legacy-peer-deps` permanentemente.

---

## Prioridade Alta

### 1. Vínculo `email_atendente`/`operator_email` sem normalização
**[Documentado no README, agravado por achado de código]**

O vínculo real entre `csat_results`/`crisp_conversations` e `users` é por
e-mail em texto livre, não por chave estrangeira — já causou dados
"silenciosamente vazios" no passado. Não há indício de normalização
(`lower(trim(email))`) nas funções SQL que fazem esse cruzamento.

**Ação sugerida**: confirmar no banco (fora do escopo deste frontend) se
existe normalização; um e-mail com capitalização diferente entre o Crisp e
`users.email` quebra o vínculo silenciosamente.

### 2. `csat_results.tempo_*` continua 100% nulo
**[Documentado no README]**

Sem mudança nesta rodada — segue sendo uma limitação de integração
(n8n nunca preencheu essas colunas), não um bug de código. Todas as telas
já foram migradas para usar `crisp_conversations` como fonte de tempo
onde fazia sentido (Analytics, Performance, Meu Painel, e agora Reunião de
Resultados).

---

## Prioridade Média

### 3. `DbCsatResult` ainda não reflete o schema completo descrito no README
**[Verificado por grep]**

Corrigimos apenas o campo `email` (que já estava em uso no código). O
README também documenta `telefone`, `numero_whatsapp`, `estado`,
`tags_cliente` e `link_chamado` como colunas reais de `csat_results` que
não estão no tipo `DbCsatResult` — hoje sem uso na UI, então não bloqueiam
o build, mas vale mapear se alguma tela futura for exibi-las.

### 4. Decisão pendente: `nps_responses` vs. `nps_followups`
**[Documentado no README]** — sem mudança nesta rodada.

### 5. Reclame Aqui e NPS seguem sobre dados de exemplo
**[Documentado no README]** — sem mudança nesta rodada; depende de
integração externa (HugMe/Crisp via n8n).

---

## Prioridade Baixa

### 6. `AdminEscalas`/Calendário — aproximações de jornada
**[Documentado no README]** — decisão de produto já registrada, sem ação
necessária.

### 7. Horário de expediente sem diferenciar fins de semana/feriados
**[Documentado no README]** — idem.

### 8. Roadmap de escopo original fora desta fase
**[Documentado no README]** — Reunião de Resultados avançada (comparação
semana×semana, exportar PDF, copiar relatório), Sistema de Tags em
Documentação, cache de analytics (`analytics_cache`). Backlog de produto,
não bugs.

---

## Metodologia e limitações desta análise

- A rodada anterior (levantamento inicial) foi feita por leitura de código
  e busca estática (`grep`). Esta rodada, além disso, **rodou o build real
  pela primeira vez** (`npm run build`), o que revelou uma classe de
  problemas que a análise estática sozinha não detecta: erros de tipo
  reais e um conflito de dependências no `package.json`.
- Não houve acesso ao schema real do Supabase (sem MCP/CLI do Supabase
  configurado nesta sessão) — qualquer afirmação sobre o banco vem do que
  está documentado no `README.md` do projeto ou refletido nos tipos `Db*`.
- Não foi rodado `npm run lint` (ESLint) nesta rodada — só `tsc -b` e
  `vite build`. Vale rodar o lint numa próxima passada.
- O ambiente de desenvolvimento usado para validar o build precisou de
  Node 20 (via `nvm`) e `npm install --legacy-peer-deps` — ver o achado
  novo acima antes de assumir que `npm install` puro funciona em outra
  máquina.
