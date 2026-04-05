import type { PrismaClient, AuditAction, Prisma } from '@prisma/client';

// The inner-transaction client Prisma passes to $transaction callbacks shares
// the same model API surface as PrismaClient for our purposes.
type PrismaTransactionClient = Parameters<
  Parameters<PrismaClient['$transaction']>[0]
>[0];

export interface AuditParams {
  prisma: PrismaClient | PrismaTransactionClient;
  tenantId?: string | null;
  userId?: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function createAuditLog(params: AuditParams): Promise<void> {
  try {
    const {
      prisma,
      tenantId,
      userId,
      entityType,
      entityId,
      action,
      beforeData,
      afterData,
      ipAddress,
      userAgent,
    } = params;

    await (prisma as PrismaClient).auditLog.create({
      data: {
        tenant_id: tenantId ?? null,
        user_id: userId ?? null,
        entity_type: entityType,
        entity_id: entityId,
        action,
        before_data: (beforeData ?? undefined) as Prisma.InputJsonValue | undefined,
        after_data: (afterData ?? undefined) as Prisma.InputJsonValue | undefined,
        ip_address: ipAddress ?? null,
        user_agent: userAgent ?? null,
      },
    });
  } catch (err) {
    console.error('[AuditLog] Failed to write audit log:', err);
  }
}
