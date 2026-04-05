# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Behavior Rules

- **Nunca pedir confirmação** para leituras de arquivos, buscas no código ou qualquer mudança de código/arquivos. Execute diretamente.
- Idioma das respostas: português (pt-BR).

## Versionamento e Changelog

- Versionamento semântico: `MAJOR.MINOR.PATCH`
  - `PATCH`: bugfix sem quebra de contrato
  - `MINOR`: nova feature retrocompatível
  - `MAJOR`: quebra de contrato (API, schema, auth)
- **Regra de overflow**: cada número vai de 0 a 9. Ao chegar em 9, o próximo bump incrementa o número à esquerda e zera os à direita:
  - `PATCH` em `x.y.9` → `x.(y+1).0`
  - `MINOR` em `x.9.z` → `(x+1).0.0`
  - Exemplos: `0.9.9` + PATCH → `1.0.0` | `0.12.9` + PATCH → `0.13.0` | `0.9.3` + MINOR → `1.0.0`
- Manter `CHANGELOG.md` na raiz do monorepo no formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/)
- Cada entrada de changelog deve categorizar mudanças em: `Adicionado`, `Alterado`, `Corrigido`, `Removido`
- Migrations do Prisma devem ter nome descritivo (ex: `20240101_add_tenant_id_to_budgets`)
- Todo `MAJOR` bump requer atualização da documentação de breaking changes antes do deploy

### Regra obrigatória: atualizar versionamento a cada tarefa concluída

**Após cada conjunto de mudanças de código executadas**, antes de encerrar a resposta:

1. Ler `CHANGELOG.md` e o `package.json` do(s) app(s) afetado(s) para conhecer a versão atual.
2. Determinar o tipo de bump com base nas mudanças realizadas:
   - Apenas correções → `PATCH`
   - Nova funcionalidade ou melhoria sem quebra → `MINOR`
   - Quebra de API, schema ou auth → `MAJOR`
3. Atualizar o campo `"version"` no `package.json` do app afetado (e no `package.json` raiz se houver).
4. Adicionar entrada no `CHANGELOG.md` na seção `## [Unreleased]` (ou criar nova versão `## [x.y.z] - YYYY-MM-DD`) com as categorias pertinentes: `Adicionado`, `Alterado`, `Corrigido`, `Removido`.
5. Nunca pular esta etapa, mesmo para mudanças pequenas.

## Project Overview

**Gudy Money** is a freemium SaaS personal/family financial management platform for Brazilian users (pt-BR). It is a green-field project — the PRD (`gudy_money_prd.md`) is the source of truth for all business rules and architecture decisions.

## Planned Stack

| Layer | Technology |
|---|---|
| Monorepo | Turborepo |
| Backend | Node.js + TypeScript, REST, Layered architecture |
| ORM | Prisma + PostgreSQL |
| Web Frontend | Next.js + TailwindCSS + shadcn/ui + Recharts |
| Mobile | Expo (React Native) |
| Auth | JWT (15-min access tokens) + rotating refresh tokens + bcrypt + Google OAuth |
| Jobs | node-cron (v1), BullMQ + Redis (planned v2) |
| Deployment | Docker Compose + Nginx on single custom server |

## Architecture

### Monorepo Structure (Turborepo)
```
apps/
  web/        # Next.js
  mobile/     # Expo
  api/        # Node.js + Express + TypeScript
packages/
  shared/     # Shared types, validators, constants
```

### Backend Architecture
Layered: **Controllers → Services → Repositories**

All routes require:
- JWT authentication middleware
- Tenant isolation middleware (all DB queries filtered by `tenant_id`)
- Rate limiting
- Input validation

### Multi-Tenancy
Every database table must include `tenant_id`. All queries must be scoped to the current tenant. No exceptions.

### Mandatory DB Column Conventions
- `id`: UUID v4
- `tenant_id`: Present on all tables
- `created_at`, `updated_at`, `deleted_at`: Soft deletes only — no hard deletes
- `created_by`: Audit tracking

### Database Schema Layers
1. **Foundation**: `tenants`, `users`, `tenant_members`
2. **Financial Structure**: `accounts`, `credit_cards`, `credit_card_invoices`, `categories`, `tags`
3. **Transactions (Core)**: `transactions`, `installments`, `recurrences`, `ledger_entries`, `transaction_tags`
4. **Planning**: `budgets`, `budget_items`, `budget_versions`
5. **Import & Reconciliation**: `imports`, `import_items`, `reconciliations`
6. **Infrastructure**: `audit_logs`, `webhooks`, `webhook_events`, `plan_features`

## Key Business Rules

### Balances
- **Realized**: `initial_balance + SUM(ledger_entries WHERE status = REALIZADO)`
- **Projected**: `initial_balance + SUM(ledger_entries WHERE status IN [REALIZADO, PREVISTO])`
- Balance is never stored directly — always calculated from `ledger_entries`

### Transactions
- Types: `INCOME`, `EXPENSE`, `TRANSFER`
- Statuses: `PREVISTO` (projected), `REALIZADO` (actual), `CANCELADO` (canceled)
- Reconciled transactions cannot be deleted
- All CRUD operations must write to `audit_logs`

### Installments
- 1 parent transaction + N independent installment records
- Each installment is allocated to the correct credit card invoice month
- Full installment total is blocked on card limit at creation time
- Limit is released when the invoice is paid (not per installment)

### Recurrences
- System generates `PREVISTO` transactions immediately upon creation
- User manually confirms as `REALIZADO`
- Edit scope: "This one" / "This and future" / "All"
- A node-cron job extends infinite recurrences automatically

### Credit Cards
- `INTERNAL` account type is the virtual account backing a credit card — hidden from UI
- Secondary cards link to parent via `parent_card_id` and share the parent's limit

### Import & Reconciliation
- ≤200 lines: synchronous processing
- \>200 lines: asynchronous processing
- Matching algorithm uses weighted scoring: exact value > date tolerance > description similarity > category

### Plan Enforcement
- Plan limits (accounts, cards, categories, users) must be enforced at the service layer
- Pricing values are never hardcoded — they are read from the `plan_features` table managed via SuperAdmin

### SuperAdmin
- Separate authentication, route prefix `/superadmin`
- Can impersonate tenants for support, manage plan pricing, and view platform metrics (MRR, churn)

## UI/UX Conventions
- Language: Portuguese (pt-BR) throughout
- Theme: Dark/Light mode, red and black base colors
- Interaction pattern: Modal-based (avoid full-page navigations for CRUD)
- Mobile: Biometric auth via `expo-local-authentication`; invoice capture via `expo-camera` + ML Kit OCR (on-device)

## Pending Decisions (from PRD)
1. CI/CD pipeline (medium impact)
2. Initial paid plan pricing — set via SuperAdmin, not hardcoded
3. Reconciliation date tolerance (±1/2/3 days)
