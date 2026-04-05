import { prisma } from '../../lib/prisma';
import { createAuditLog } from '../../lib/audit';
import { comparePassword } from '../../lib/bcrypt';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConsentPurpose = 'service_processing' | 'analytics' | 'marketing';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const lgpdService = {
  /**
   * Return a structured data summary for the user (categories, not raw data).
   */
  async getMyData(
    userId: string,
    tenantId: string,
  ): Promise<{
    personal: { name: string; email: string; created_at: Date };
    financial: {
      transaction_count: number;
      account_count: number;
      category_count: number;
    };
    consents: unknown[];
    data_categories: string[];
  }> {
    const user = await prisma.user.findFirst({
      where: { id: userId, deleted_at: null },
      select: { name: true, email: true, created_at: true },
    });

    if (user === null) {
      throw new NotFoundError('Usuário não encontrado.');
    }

    const [transaction_count, account_count, category_count, consents] =
      await Promise.all([
        prisma.transaction.count({
          where: { tenant_id: tenantId, user_id: userId, deleted_at: null },
        }),
        prisma.account.count({
          where: { tenant_id: tenantId, deleted_at: null },
        }),
        prisma.category.count({
          where: { tenant_id: tenantId, deleted_at: null },
        }),
        prisma.lgpdConsent.findMany({
          where: { user_id: userId },
          orderBy: { granted_at: 'desc' },
        }),
      ]);

    return {
      personal: {
        name: user.name,
        email: user.email,
        created_at: user.created_at,
      },
      financial: { transaction_count, account_count, category_count },
      consents,
      data_categories: [
        'Transações',
        'Contas',
        'Categorias',
        'Orçamentos',
        'Importações',
        'Logs de acesso',
      ],
    };
  },

  /**
   * Return all consent records for a user (granted and revoked).
   */
  async getConsents(userId: string): Promise<unknown[]> {
    return prisma.lgpdConsent.findMany({
      where: { user_id: userId },
      orderBy: { granted_at: 'desc' },
    });
  },

  /**
   * Record consent for one or more purposes.
   * Upserts: revokes any existing active consent for each purpose, then creates a new one.
   */
  async recordConsent(
    userId: string,
    tenantId: string,
    purposes: ConsentPurpose[],
    policyVersion: string,
    ipAddress?: string,
  ): Promise<void> {
    for (const purpose of purposes) {
      // Revoke existing active consent for this purpose (if any)
      await prisma.lgpdConsent.updateMany({
        where: {
          user_id: userId,
          purpose,
          revoked_at: null,
        },
        data: { revoked_at: new Date() },
      });

      // Create new consent record
      await prisma.lgpdConsent.create({
        data: {
          user_id: userId,
          tenant_id: tenantId,
          purpose,
          policy_version: policyVersion,
          ip_address: ipAddress ?? null,
          granted_at: new Date(),
        },
      });
    }
  },

  /**
   * Revoke consent for a specific purpose.
   */
  async revokeConsent(
    userId: string,
    tenantId: string,
    purpose: ConsentPurpose,
  ): Promise<void> {
    const result = await prisma.lgpdConsent.updateMany({
      where: {
        user_id: userId,
        purpose,
        revoked_at: null,
      },
      data: { revoked_at: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundError(
        `Consentimento ativo para "${purpose}" não encontrado.`,
      );
    }
  },

  /**
   * Export all of the user's financial data as CSV.
   * Includes soft-deleted transactions (marked with deleted_at column).
   */
  async exportMyData(
    userId: string,
    tenantId: string,
  ): Promise<{ csv_content: string; filename: string }> {
    // Fetch all transactions (including soft-deleted) with relations
    const transactions = await prisma.transaction.findMany({
      where: { tenant_id: tenantId, user_id: userId },
      include: {
        category: { select: { name: true } },
        account: { select: { name: true } },
        credit_card: { select: { name: true } },
      },
      orderBy: { date: 'asc' },
    });

    const headers = [
      'type',
      'date',
      'description',
      'amount',
      'category',
      'account',
      'status',
      'deleted_at',
    ];

    const escapeCsv = (value: unknown): string => {
      const str = value === null || value === undefined ? '' : String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = transactions.map((t) => {
      const accountName =
        t.account?.name ?? t.credit_card?.name ?? '';
      return [
        t.type,
        t.date.toISOString().split('T')[0],
        t.description,
        t.amount.toString(),
        t.category?.name ?? '',
        accountName,
        t.status,
        t.deleted_at ? t.deleted_at.toISOString() : '',
      ]
        .map(escapeCsv)
        .join(',');
    });

    const csv_content = [headers.join(','), ...rows].join('\n');

    const date = new Date().toISOString().split('T')[0];
    const filename = `gudy-money-${userId}-${date}.csv`;

    return { csv_content, filename };
  },

  /**
   * Request account deletion — verifies password, anonymizes user data,
   * and soft-deletes the account. Financial data is retained per LGPD (5 years).
   */
  async requestAccountDeletion(
    userId: string,
    tenantId: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    // 1. Verify password
    const user = await prisma.user.findFirst({
      where: { id: userId, deleted_at: null },
      select: { id: true, password_hash: true },
    });

    if (user === null) {
      throw new NotFoundError('Usuário não encontrado.');
    }

    if (user.password_hash === null) {
      throw new ValidationError(
        'Conta criada via Google. Use a opção de exclusão via Google ou contate o suporte.',
      );
    }

    const passwordValid = await comparePassword(password, user.password_hash);
    if (!passwordValid) {
      throw new ForbiddenError('Senha incorreta.');
    }

    // 2. Check if user is the only ADMIN — if others exist, block deletion
    const tenantMembers = await prisma.tenantMember.findMany({
      where: { tenant_id: tenantId, deleted_at: null },
      select: { user_id: true, role: true },
    });

    const admins = tenantMembers.filter((m) => m.role === 'ADMIN');
    const isOnlyAdmin =
      admins.length === 1 && admins[0]!.user_id === userId;
    const otherMembers = tenantMembers.filter((m) => m.user_id !== userId);

    if (!isOnlyAdmin && otherMembers.length > 0) {
      // User is not the only admin but there are other members
      // Only block if there are other members and the user is the sole admin
    }

    if (isOnlyAdmin && otherMembers.length > 0) {
      throw new ForbiddenError(
        'Você é o único administrador e existem outros membros na conta. Remova os membros ou transfira a administração antes de excluir sua conta.',
      );
    }

    // 3. Perform deletion in a transaction
    await prisma.$transaction(async (tx) => {
      const now = new Date();

      // a. Anonymize user
      await tx.user.update({
        where: { id: userId },
        data: {
          name: 'Usuário Excluído',
          email: `deleted_${userId}@deleted.local`,
          password_hash: null,
          google_id: null,
          deleted_at: now,
        },
      });

      // b/c. Soft-delete TenantMember records for this user
      await tx.tenantMember.updateMany({
        where: { user_id: userId, tenant_id: tenantId, deleted_at: null },
        data: { deleted_at: now },
      });

      // d. If user is the only member, soft-delete the tenant too
      if (otherMembers.length === 0) {
        await tx.tenant.update({
          where: { id: tenantId },
          data: { deleted_at: now },
        });
      }

      // e. Revoke all refresh tokens
      await tx.refreshToken.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: now },
      });

      // f. Audit log
      await createAuditLog({
        prisma: tx as Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
        tenantId,
        userId,
        entityType: 'users',
        entityId: userId,
        action: 'DELETE',
        afterData: { reason: 'user_requested_account_deletion' },
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });
    });

    return {
      message:
        'Conta excluída. Dados financeiros retidos por 5 anos conforme exigência legal.',
    };
  },
};
