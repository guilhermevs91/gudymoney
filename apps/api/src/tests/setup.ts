import { prisma } from '../lib/prisma';

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  // TRUNCATE CASCADE handles circular FKs (accounts ↔ credit_cards) cleanly
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      audit_logs,
      ledger_entries,
      transaction_tags,
      installment_items,
      installments,
      transactions,
      recurrences,
      budget_items,
      budget_versions,
      budgets,
      import_items,
      reconciliations,
      imports,
      invoice_payments,
      credit_card_invoices,
      accounts,
      credit_cards,
      categories,
      tags,
      webhook_events,
      webhooks,
      notifications,
      lgpd_consents,
      refresh_tokens,
      invites,
      tenant_members,
      tenants,
      users,
      superadmin_users
    RESTART IDENTITY CASCADE
  `);
  await prisma.$disconnect();
});
