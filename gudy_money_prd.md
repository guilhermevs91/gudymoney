# PRD — Gudy Money
> Versão: 1.0
> Status: fechado — pronto para desenvolvimento
> Idioma do sistema: pt-BR
> Última atualização: 2026-03-27

---

## 1. Visão geral do produto

**Gudy Money** é uma aplicação de gestão financeira pessoal e familiar, voltada para usuários brasileiros de todos os perfis de sofisticação financeira — do iniciante ao avançado.

O produto opera no modelo **freemium**, com plano gratuito individual e plano pago que habilita o modo familiar e funcionalidades avançadas.

---

## 2. Usuários e personas

### 2.1 Perfis de usuário
- **Usuário individual** — controla suas próprias finanças sozinho
- **Usuário familiar (admin)** — gerencia o tenant e define permissões dos membros
- **Usuário familiar (membro)** — acessa o sistema conforme permissões definidas pelo admin

### 2.2 Níveis de sofisticação financeira suportados
- Iniciante (nunca controlou finanças)
- Intermediário (usa planilha ou app básico)
- Avançado (entende DRE, fluxo de caixa)

> A interface deve se adaptar ao contexto sem exigir conhecimento técnico-financeiro para uso básico.

---

## 3. Modelo de negócio

### 3.1 Plano Gratuito — Individual
- 1 usuário por tenant
- Até 2 contas
- Até 1 cartão de crédito
- Até 8 categorias de lançamento ativas (soft delete não conta para o limite)
- Tags ilimitadas
- Lançamentos manuais ilimitados
- Recorrência simples: até 3 meses de horizonte
- Dashboard básico
- Histórico de 3 meses (dados mais antigos ficam no banco, apenas ocultos na UI; ao fazer upgrade, recupera o histórico completo)
- O plano gratuito é o trial — não há período de teste separado do plano pago

### 3.2 Plano Pago — Family / Pro
- Múltiplos usuários no tenant (modo família)
- Contas e cartões ilimitados
- Cartões adicionais vinculados
- Categorias ilimitadas
- Tags ilimitadas
- Parcelamento completo
- Recorrência com horizonte ilimitado (usuário define)
- Importação de extratos (OFX/CSV/TXT)
- Conciliação inteligente
- Plano orçamentário com rollover configurável por categoria
- Planejamento e projeção futura
- Dashboard avançado com gráficos interativos
- Histórico ilimitado

### 3.3 Periodicidade e preços
- Planos disponíveis: mensal e anual
- Valores definidos no painel de SuperAdmin (não hardcoded) via gateway Asaas
- Gateway de pagamento: **Asaas** (PIX, boleto, cartão de crédito, recorrência nativa)

### 3.4 SuperAdmin
- Painel na rota `/superadmin` do mesmo projeto, com autenticação separada
- Funcionalidades da v1:
  - Gestão de tenants (visualizar, bloquear, excluir)
  - Gestão de usuários (visualizar, bloquear, excluir)
  - Configurar valores dos planos mensal e anual (sincronizados com o Asaas)
  - Métricas da plataforma: MRR (soma de todos os planos ativos no mês), churn (% de tenants que cancelaram no mês / total ativo no início do mês), tenants ativos, novos registros
  - Gerenciar feature flags por plano (`plan_features`)
  - Impersonar tenant para suporte
  - Gerenciar webhooks globais da plataforma

---

## 4. Stack tecnológica

### 4.1 Backend
- Runtime: Node.js com TypeScript
- Banco de dados: PostgreSQL
- ORM: Prisma
- Autenticação: JWT (access token 15min) + refresh token rotativo + bcrypt + Google OAuth
- Segurança: rate limiting, validação de input, HMAC-SHA256 em webhooks
- Arquitetura: camadas (Controllers → Services → Repositories)
- API: REST
- Fuso horário padrão do sistema: `America/São_Paulo`

### 4.2 Frontend Web
- Framework: Next.js (React)
- Estilização: TailwindCSS
- Biblioteca de componentes: shadcn/ui
- Gráficos: Recharts
- Todas as ações em modais
- Tema claro e escuro
- Cores base: vermelho e preto
- Interface responsiva
- Idioma: pt-BR

### 4.3 Mobile
- Framework: Expo (React Native)
- Monorepo com Next.js via Turborepo
- Autenticação biométrica: Face ID / Touch ID via `expo-local-authentication`
- Câmera para captura de nota fiscal: `expo-camera`
- OCR de nota fiscal: ML Kit local via `@react-native-ml-kit/text-recognition` — processamento no dispositivo, sem custo, sem dado enviado para servidores externos
- Publicação: App Store (iOS) e Play Store (Android)

### 4.4 Infraestrutura
- Deploy: data center próprio com Docker
- Orquestração: Docker Compose (tudo em um servidor)
- Reverse proxy: Nginx com SSL
- CI/CD: GitHub Actions
- Estrutura preparada para migrar para BullMQ + Redis na v2 sem refatoração de regras de negócio

---

## 5. Arquitetura do sistema

### 5.1 Multi-tenant
- Cada usuário pertence a um tenant
- Um tenant pode ter múltiplos usuários
- Isolamento total por `tenant_id` em todas as tabelas
- Estrutura preparada para RBAC futuro
- Permissões na v1:
  - **Admin**: acesso total — criar/editar/excluir qualquer recurso, convidar/remover membros, configurar orçamento
  - **Membro**: pode criar e editar suas próprias transações; pode visualizar contas, cartões, orçamento e relatórios do tenant; não pode excluir recursos de outros membros; não pode gerenciar membros
- Apenas o admin pode convidar novos membros

### 5.2 Padrões obrigatórios de banco
- `tenant_id` em todas as tabelas (exceto `tenants`, `users`, `superadmin_users`)
- `id` UUID v4
- `created_at`, `updated_at`, `deleted_at` em todas as tabelas
- `created_by` para rastreio de auditoria (UUID do usuário; `null` para ações do sistema)
- Soft delete em todas as entidades — nenhum registro é deletado fisicamente

### 5.3 Arquitetura backend em camadas
```
Controllers  →  validação de input, autenticação, resposta HTTP
Services     →  regras de negócio, eventos internos
Repositories →  acesso ao banco via Prisma
```

### 5.4 Middleware obrigatório
- Autenticação JWT
- Isolamento por tenant (toda query filtra por `tenant_id`)
- Rate limiting
- Validação de input

---

## 6. Modelagem de dados — camadas lógicas

### Camada 1 — Fundação
| Tabela | Descrição |
|---|---|
| `tenants` | Tenant raiz de cada conta/família. Inclui `budget_scope` (ENUM: `TENANT` \| `USER`), `plan` e `plan_expires_at` |
| `users` | Usuários do sistema |
| `tenant_members` | Relacionamento usuário ↔ tenant com `role` (ENUM: `ADMIN` \| `MEMBER`) |
| `superadmin_users` | Usuários do painel SuperAdmin — autenticação separada, sem `tenant_id` |
| `invites` | Convites de membros: `email`, `tenant_id`, `role`, `token` (UUID), `expires_at`, `accepted_at` |

### Camada 2 — Estrutura financeira
| Tabela | Descrição |
|---|---|
| `accounts` | Contas corrente, poupança, carteira e INTERNAL (conta virtual do cartão) |
| `credit_cards` | Cartões de crédito com limite total/utilizado/disponível |
| `credit_card_invoices` | Faturas mensais com abertura, fechamento e vencimento |
| `categories` | Categorias e subcategorias de lançamento |
| `tags` | Sistema flexível de classificação adicional — ilimitado em ambos os planos |

### Camada 3 — Lançamentos (núcleo)
| Tabela | Descrição |
|---|---|
| `transactions` | Todo lançamento financeiro (receita, despesa, transferência) |
| `installments` | Parcelamentos — entidade própria com vínculo à transação-mãe |
| `recurrences` | Definição de séries recorrentes |
| `ledger_entries` | Entradas duplas do ledger para cada movimentação |
| `transaction_tags` | Relacionamento N:N entre transações e tags |

### Camada 4 — Planejamento
| Tabela | Descrição |
|---|---|
| `budgets` | Orçamento mensal por tenant/usuário — escopo definido por `budget_scope` em `tenants` |
| `budget_items` | Itens do orçamento por categoria com flag de rollover |
| `budget_versions` | Versionamento de orçamento |

### Camada 5 — Importação e conciliação
| Tabela | Descrição |
|---|---|
| `imports` | Registro de cada importação (OFX/CSV/TXT) |
| `import_items` | Linhas individuais de cada importação |
| `reconciliations` | Matching entre import_items e transactions |

### Camada 6 — Infraestrutura
| Tabela | Descrição |
|---|---|
| `audit_logs` | Log de ações: create, update, delete com dados anteriores/posteriores |
| `webhooks` | Configuração de webhooks por tenant com `secret` para HMAC-SHA256 |
| `webhook_events` | Eventos disparados por webhook com `status`, `attempts`, `last_attempt_at` |
| `plan_features` | Feature flags por plano (controle de freemium) — gerenciados via SuperAdmin |
| `lgpd_consents` | Registro de consentimentos LGPD: `user_id`, `purpose`, `version`, `ip`, `granted_at`, `revoked_at` |

---

## 7. Entidades principais — regras de negócio

### 7.1 Contas (`accounts`)
- Tipos: `CHECKING` (corrente), `SAVINGS` (poupança), `WALLET` (carteira), `INTERNAL` (conta virtual do cartão)
- Saldo **nunca** é armazenado diretamente
- Saldo calculado: `initial_balance + SUM(ledger_entries WHERE account_id AND deleted_at IS NULL)`
- `initial_balance` declarado pelo usuário na criação da conta
- Contas `INTERNAL` são invisíveis na UI — criadas automaticamente ao cadastrar um cartão; `created_by` = ID do usuário que criou o cartão
- Índice obrigatório: `(account_id, status, deleted_at)` em `ledger_entries` para performance do cálculo de saldo

### 7.2 Cartões de crédito (`credit_cards`)
- Campos: `limit_total`, `limit_used`, `limit_available`
- Campos de ciclo: `closing_day` (dia de fechamento), `due_day` (dia de vencimento)
- Cartões adicionais vinculados ao cartão principal via `parent_card_id`
- Limite compartilhado entre adicional e cartão pai — `limit_used` e `limit_available` ficam no cartão principal
- Cada cartão tem um `internal_account_id` FK para sua conta virtual
- Liberação de limite ocorre quando a **fatura é paga** (não por parcela individual)
- Ao criar cartão adicional, o `internal_account_id` aponta para a conta INTERNAL do **cartão adicional** (própria)

### 7.3 Faturas (`credit_card_invoices`)
- Cada fatura tem `period_start`, `period_end`, `due_date` e `status`
- Status: `OPEN`, `CLOSED`, `PAID`, `PARTIAL`
- Alocação de compra: determinada pela data da compra vs período de fechamento do cartão (fuso: `America/São_Paulo`)
- Fatura fechada: ao lançar compra com data dentro do período, sistema alerta e exige confirmação
- Pagamento parcial: o usuário pode fazer múltiplos pagamentos parciais até quitar a fatura. Cada pagamento registra o valor pago. Quando `total_paid >= total_amount`, status → `PAID`. Enquanto `total_paid < total_amount`, status = `PARTIAL`
- Juros sobre pagamento parcial: lançamento manual pelo usuário — sem cálculo automático na v1
- Parcelas de cartão adicional: alocadas nas **faturas do cartão adicional** (não do cartão principal)

### 7.4 Transações (`transactions`)
- Tipos: `INCOME` (receita), `EXPENSE` (despesa), `TRANSFER` (transferência)
- Status: `PREVISTO`, `REALIZADO`, `CANCELADO`
- Campos obrigatórios: categoria, conta ou cartão, data, valor, status
- Subcategoria: opcional (quando categoria tem subcategorias cadastradas)
- Campos adicionais: `external_id` (Open Finance), tags, notas
- Transação conciliada: não pode ser deletada — precisa desconciliar antes
- Ao desconciliar: matching desfeito, item volta para status não conciliado
- Busca: por campos (categoria, data, valor, status, conta, cartão, tag) + texto livre por descrição

### 7.5 Parcelamentos (`installments`)
- Criado no momento em que o usuário declara a compra como parcelada
- Estrutura: 1 `transaction` mãe + N `installments` independentes
- Cada parcela: `installment_id`, `recurrence_index`, `credit_card_invoice_id` do seu mês (fatura do cartão onde foi feita a compra — adicional ou principal)
- Limite do cartão: valor **total** bloqueado no cartão principal na criação (via `parent_card_id`); libera quando a fatura que contém a parcela é paga
- Não há limite máximo de parcelas na v1

### 7.6 Recorrências (`recurrences`)
- Usuário define: valor, categoria, conta/cartão, frequência e horizonte
- **Plano gratuito**: horizonte máximo de 3 meses
- **Plano pago**: horizonte definido pelo usuário (N meses ou infinito)
- Para recorrências com horizonte finito (N meses): sistema gera todos os lançamentos `PREVISTO` imediatamente
- Para recorrências infinitas (plano pago): sistema gera 12 meses de lançamentos `PREVISTO` na criação; job node-cron estende o horizonte automaticamente (adiciona mais 3 meses quando o último lançamento gerado estiver a menos de 3 meses do fim do horizonte atual)
- Ao chegar o mês, usuário confirma como `REALIZADO`
- Edição: usuário escolhe entre — só esta / esta e futuras / todas
- Cancelamento: usuário decide o que fazer com os `PREVISTO` futuros já gerados (manter como PREVISTO, cancelar todos, ou cancelar somente os futuros)
- Cada transação gerada contém: `recurrence_id` (FK) + `recurrence_index` (nº da ocorrência)

### 7.7 Ledger (`ledger_entries`)
- Toda movimentação gera entradas duplas no ledger
- Transferência entre contas: débito na origem + crédito no destino
- Pagamento de fatura: débito na conta corrente + crédito na conta INTERNAL do cartão
- Saldo realizado: `initial_balance + SUM(ledger_entries WHERE status = REALIZADO AND deleted_at IS NULL)`
- Saldo projetado: `initial_balance + SUM(ledger_entries WHERE status IN [REALIZADO, PREVISTO] AND deleted_at IS NULL)`
- Índice obrigatório: `(account_id, status, deleted_at)` para performance

### 7.8 Orçamento (`budgets` / `budget_items` / `budget_versions`)
- Orçamento mensal por categoria
- **Escopo**: definido pelo campo `budget_scope` na tabela `tenants` (ENUM: `TENANT` | `USER`). Apenas o admin pode alterar. No plano gratuito (1 usuário), o escopo é sempre `TENANT`
- Rollover configurável por categoria — se ativado, saldo não utilizado passa para o mês seguinte
- Comparação: planejado vs realizado
- Versionamento obrigatório (`budget_versions`)

### 7.9 Categorias (seed data)
- 8 categorias padrão criadas automaticamente para cada novo tenant:
  `Moradia`, `Alimentação`, `Transporte`, `Saúde`, `Educação`, `Lazer`, `Vestuário`, `Outros`
- Todas deletáveis pelo usuário (soft delete)
- Soft delete não conta para o limite de 8 do plano gratuito
- Usuário pode criar subcategorias dentro de qualquer categoria

### 7.10 Tags
- Sistema flexível N:N entre transações e tags via `transaction_tags`
- **Ilimitadas em ambos os planos**
- Exemplos de uso: `viagem`, `reembolsável`, `trabalho`, `emergência`

---

## 8. Saldo

| Tipo | Definição |
|---|---|
| Realizado | `initial_balance + SUM(ledger_entries WHERE status = REALIZADO AND deleted_at IS NULL)` |
| Projetado | `initial_balance + SUM(ledger_entries WHERE status IN [REALIZADO, PREVISTO] AND deleted_at IS NULL)` |

- Calculado sempre na hora — sem cache na v1
- Performance garantida por índice composto `(account_id, status, deleted_at)` em `ledger_entries`
- Dashboard exibe os dois separadamente com distinção visual clara

---

## 9. Importação e conciliação

- Formatos: OFX, CSV e TXT
- Processamento híbrido por tamanho: até 200 linhas → síncrono; acima → assíncrono com notificação in-app
- CSV: interface de mapeamento de colunas com perfis pré-configurados por banco (Nubank, Itaú, Bradesco, Santander, Banco do Brasil, genérico)
- Algoritmo de matching com score composto:
  1. Valor exato — peso 4
  2. Data com tolerância de **±2 dias** — peso 3
  3. Descrição parcial — busca por texto similar — peso 2
  4. Categoria — critério de desempate — peso 1
- Múltiplas candidatas: sistema apresenta opções ordenadas por score e usuário escolhe
- Transação conciliada fica bloqueada para deleção até desconciliar

---

## 10. Dashboard

- Período padrão: mês atual — configurável pelo usuário
- Saldo consolidado (realizado + projetado, separados visualmente)
- Receitas vs despesas
- Orçamento vs realizado por categoria
- Gráficos interativos clicáveis para filtro
- Evolução mensal (últimos 6 meses)
- Gastos por categoria (top 5)
- Projeção de saldo futuro (baseada em recorrências ativas + orçamento)
- Dashboard básico (plano gratuito): saldo + receita/despesa do mês + top categorias
- Dashboard avançado (plano pago): todos os itens acima + evolução + projeção
- Biblioteca: Recharts

---

## 11. UI/UX

- Design moderno estilo fintech
- Tema claro e escuro
- Cores base: vermelho e preto
- Biblioteca de componentes: shadcn/ui + TailwindCSS
- Interface responsiva
- Idioma: pt-BR
- Todas as ações em modais
- Tabelas com filtro, ordenação e paginação

---

## 12. Autenticação e segurança

- Email + senha com bcrypt
- Google OAuth
- JWT: access token 15 minutos
- Refresh token rotativo — reutilização detectada invalida a sessão
- Rate limiting em todas as rotas
- Validação de input em todas as rotas
- Isolamento por tenant em todas as queries
- Mobile: biometria via `expo-local-authentication` (Face ID / Touch ID)
- Sem double opt-in de e-mail — cadastro direto
- 2FA: deixado para v2
- E-mail transacional: deixado para v2 (sem serviço de e-mail na v1)

---

## 13. Onboarding

### 13.1 Fluxo de cadastro
1. Usuário acessa `/register` → preenche nome, e-mail, senha
2. Sistema cria: `user` + `tenant` + `tenant_member` (role: ADMIN) + 8 categorias seed
3. Usuário é redirecionado para o dashboard com estado vazio e tour guiado de boas-vindas
4. Tour guiado: "Adicionar primeira conta" → "Adicionar primeira transação" → "Explorar o dashboard"

### 13.2 Convite de membros (plano pago)
1. Admin acessa Configurações → Membros → Convidar
2. Admin informa e-mail e role do convidado
3. Sistema cria registro em `invites` com token UUID e validade de 7 dias
4. Na v1 (sem e-mail): sistema exibe link de convite para o admin copiar e enviar manualmente
5. Convidado acessa o link → se já tem conta: vincula ao tenant → se não tem: cria conta e vincula
6. Admin pode cancelar convites pendentes e remover membros a qualquer momento

---

## 14. Funcionalidades avançadas

### 14.1 Event-driven interno
- Ao criar/confirmar transação → atualizar ledger
- Ao pagar fatura → liberar limite do cartão
- Ao criar parcelamento → alocar parcelas nas faturas dos meses correspondentes
- Ao cancelar recorrência → disparar evento para tratamento dos PREVISTO futuros

### 14.2 Auditoria
- Log de todas as ações: create, update, delete
- Armazena: usuário, data, dados anteriores (JSON), dados posteriores (JSON)
- Ações do sistema (ex: criação de conta INTERNAL): `created_by = null`

### 14.3 Tags
- Sistema flexível N:N entre transações e tags via `transaction_tags`
- Ilimitado em ambos os planos

### 14.4 Busca e filtros
- Filtros por: período, categoria, tag, conta, cartão, status, valor
- Busca por texto livre na descrição da transação

### 14.5 Open Finance ready
- Campo `external_id` em transações para integrações futuras
- Integração completa com Open Finance Brasil (OAuth2 + FAPI) planejada para v2

### 14.6 Notificações in-app
- Importação assíncrona concluída
- Convite aceito por membro
- Orçamento atingiu 80% do limite (aviso) e 100% (alerta)
- Fatura com vencimento em 3 dias

### 14.7 Projeção de saldo futuro
- Baseada em recorrências ativas + orçamento planejado
- Mostra saldo projetado para os próximos 3 meses
- Disponível no plano pago

---

## 15. Webhooks

- Configuração por tenant (plano pago)
- Secret por webhook para validação HMAC-SHA256 no payload
- Timeout por request: **30 segundos**
- Retry automático: **3 tentativas** com backoff exponencial (30s, 5min, 30min)
- Eventos que disparam webhook:
  - `transaction.created`
  - `transaction.updated`
  - `invoice.paid`
  - `budget.exceeded`
  - `import.completed`
- Formato do payload:
```json
{
  "event": "transaction.created",
  "tenant_id": "uuid",
  "timestamp": "2026-03-27T10:00:00-03:00",
  "data": { ... }
}
```
- `webhook_events` registra: `status` (SUCCESS | FAILED | PENDING), `attempts`, `last_attempt_at`, `response_status_code`

---

## 16. Jobs assíncronos

| Job | Trigger | Tecnologia |
|---|---|---|
| Extensão de horizonte de recorrências infinitas | node-cron periódico (diário) — adiciona 3 meses quando faltam menos de 3 meses no horizonte atual | node-cron |
| Importação de extrato grande (>200 linhas) | upload do usuário | Promise async |
| Envio e retry de webhook events | node-cron a cada 5 minutos | node-cron |
| Geração de notificações in-app | node-cron diário | node-cron |

> Estrutura preparada para migrar para BullMQ + Redis na v2 sem refatoração de regras de negócio.

---

## 17. LGPD — Conformidade

### 17.1 Consentimento
- Tela de consentimento exibida no primeiro acesso após cadastro
- Consentimento granular por finalidade: processamento do serviço, análise de uso, comunicações futuras
- Registro em `lgpd_consents`: `user_id`, `purpose`, `version`, `ip`, `granted_at`, `revoked_at`
- Usuário pode revogar consentimentos a qualquer momento em Configurações → Privacidade

### 17.2 Direitos do titular
- **Meus Dados** (Art. 18 I e II): tela listando categorias de dados armazenados
- **Portabilidade** (Art. 18 V): exportação de todas as transações, contas, categorias em CSV — processada em até 24h e disponibilizada para download
- **Exclusão de conta** (Art. 18 VI): fluxo em Configurações → Conta → Excluir conta. Anonimiza dados pessoais; dados financeiros retidos por 5 anos (obrigação legal). Usuário é informado do que será retido antes de confirmar.
- **Terceiros**: tela informando que dados são processados apenas pelo Asaas (cobrança) — nenhum dado compartilhado para marketing

### 17.3 Retenção
- Dados financeiros (transações, contas, faturas): retidos por **5 anos** após encerramento da conta (COAF / Lei 9.613/1998)
- Logs de autenticação: retidos por **1 ano** (Marco Civil da Internet)
- Dados de consentimento LGPD: retidos enquanto o usuário for cliente + 5 anos

---

## 18. Infraestrutura e deploy

- Ambiente: data center próprio
- Containerização: Docker
- Orquestração: Docker Compose (servidor único)
- Reverse proxy: Nginx com SSL (Let's Encrypt ou certificado interno)
- CI/CD: **GitHub Actions** — build, testes e deploy automático
- Backup PostgreSQL: diário, retenção de 30 dias
- Monitoramento: Uptime Kuma (self-hosted)
- Fuso horário do servidor: `America/São_Paulo`

---

## 19. Billing — Asaas

- Gateway: **Asaas** (regulado pelo Banco Central)
- Métodos aceitos: PIX, boleto, cartão de crédito
- Recorrência nativa do Asaas para planos mensais e anuais
- Preços sincronizados entre Asaas e tabela `plan_features` via SuperAdmin
- Fluxo de upgrade: usuário escolhe plano → geração de cobrança no Asaas → ativação automática via webhook do Asaas → update do `plan` e `plan_expires_at` em `tenants`
- Fluxo de downgrade: comunicação do impacto (ex: "você tem 3 contas; o plano gratuito permite 2") → confirmação → agendado para o vencimento atual
- Cobrança falha: Asaas faz 3 retentativas automáticas; após falha final, tenant recebe notificação in-app e status muda para `PAST_DUE` com período de graça de 7 dias
- Cancelamento: acesso mantido até o vencimento do período pago; após vencimento, downgrade automático para plano gratuito

---

## 20. Decisões resolvidas (histórico)

| # | Tema | Decisão |
|---|---|---|
| 1 | CI/CD pipeline | GitHub Actions |
| 2 | Valores iniciais do plano pago | Definido via SuperAdmin no Asaas |
| 3 | Tolerância de conciliação | ±2 dias |
| 4 | Gateway de pagamento | Asaas |
| 5 | E-mail transacional | Deixado para v2 |
| 6 | Double opt-in de e-mail | Não |
| 7 | Recorrência simples (plano gratuito) | Até 3 meses de horizonte |
| 8 | Categorias seed | 8 categorias: Moradia, Alimentação, Transporte, Saúde, Educação, Lazer, Vestuário, Outros |
| 9 | Horizonte inicial de recorrências infinitas | Usuário define; sistema gera 12 meses na criação e job estende conforme necessário |
| 10 | Soft delete e limites do plano | Soft delete não conta para o limite |
| 11 | Tags no plano gratuito | Ilimitadas em ambos os planos |
| 12 | Fuso horário | America/São_Paulo |
| 13 | Budget scope — armazenamento | Campo `budget_scope` (ENUM: TENANT \| USER) na tabela `tenants` |
| 14 | Fatura PARTIAL | Múltiplos pagamentos parciais até quitar; status → PAID quando total_paid >= total_amount |
| 15 | Parcelas de cartão adicional | Alocadas nas faturas do cartão adicional |
| 16 | Webhook retry e timeout | 3 retries com backoff exponencial; timeout 30s; HMAC-SHA256 |
| 17 | Exportação LGPD | CSV |

---

*PRD v1.0 — fechado para desenvolvimento. Próximo passo: schema Prisma completo + estrutura do monorepo.*
