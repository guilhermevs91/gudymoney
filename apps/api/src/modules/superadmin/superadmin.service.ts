import { prisma } from '../../lib/prisma';
import { PlanType } from '@prisma/client';
import { comparePassword } from '../../lib/bcrypt';
import { signSuperAdminToken, signAccessToken } from '../../lib/jwt';
import { createAuditLog } from '../../lib/audit';
import {
  UnauthorizedError,
  NotFoundError,
  AppError,
} from '../../lib/errors';
import type {
  TenantListQuery,
  UserListQuery,
  FeatureFlagInput,
} from './superadmin.schemas';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function superadminLogin(email: string, password: string) {
  const superadmin = await prisma.superadminUser.findFirst({
    where: { email, deleted_at: null },
  });

  if (!superadmin) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const valid = await comparePassword(password, superadmin.password_hash);
  if (!valid) {
    throw new UnauthorizedError('Invalid credentials');
  }

  await prisma.superadminUser.update({
    where: { id: superadmin.id },
    data: { last_login_at: new Date() },
  });

  const token = signSuperAdminToken({ superadminId: superadmin.id });

  return {
    token,
    superadmin: {
      id: superadmin.id,
      name: superadmin.name,
      email: superadmin.email,
    },
  };
}

// ---------------------------------------------------------------------------
// Dashboard metrics
// ---------------------------------------------------------------------------

export async function getDashboardMetrics() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [
    total_tenants,
    active_tenants,
    free_tenants,
    blocked_tenants,
    new_tenants_this_month,
  ] = await Promise.all([
    prisma.tenant.count({ where: { deleted_at: null } }),
    prisma.tenant.count({
      where: {
        deleted_at: null,
        plan: 'PAID',
        plan_expires_at: { gt: now },
      },
    }),
    prisma.tenant.count({ where: { deleted_at: null, plan: 'FREE' } }),
    prisma.tenant.count({
      where: { deleted_at: null, blocked_at: { not: null } },
    }),
    prisma.tenant.count({
      where: {
        deleted_at: null,
        created_at: { gte: startOfMonth, lte: endOfMonth },
      },
    }),
  ]);

  // MRR: read monthly_price from plan_features for PAID plan
  const monthlyPriceFeature = await prisma.planFeature.findFirst({
    where: { plan: 'PAID', feature_key: 'monthly_price', deleted_at: null },
  });
  const monthlyPrice = monthlyPriceFeature
    ? parseFloat(monthlyPriceFeature.feature_value)
    : 0;
  const mrr = active_tenants * (isNaN(monthlyPrice) ? 0 : monthlyPrice);

  // Churn this month: tenants downgraded (audit logs showing UPDATE on tenant with after_data.plan = FREE)
  const churnLogs = await prisma.auditLog.count({
    where: {
      entity_type: 'tenant',
      action: 'UPDATE',
      created_at: { gte: startOfMonth, lte: endOfMonth },
      after_data: {
        path: ['plan'],
        equals: 'FREE',
      },
    },
  });

  return {
    total_tenants,
    active_tenants,
    free_tenants,
    blocked_tenants,
    new_tenants_this_month,
    mrr,
    churn_this_month: churnLogs,
  };
}

// ---------------------------------------------------------------------------
// Security logs
// ---------------------------------------------------------------------------

export async function getSecurityLogs(query: {
  page?: number;
  limit?: number;
  action?: string;
  ip_address?: string;
  hours?: number;
}) {
  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? 50, 200);
  const skip = (page - 1) * limit;
  const hours = query.hours ?? 24;

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const where: Record<string, unknown> = {
    created_at: { gte: since },
  };
  if (query.action) where['action'] = query.action;
  if (query.ip_address) where['ip_address'] = { contains: query.ip_address };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        created_at: true,
        action: true,
        entity_type: true,
        entity_id: true,
        ip_address: true,
        user_agent: true,
        tenant_id: true,
        user_id: true,
        after_data: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  // IPs com mais tentativas de login nas últimas `hours` horas
  const loginAttempts = await prisma.auditLog.groupBy({
    by: ['ip_address'],
    where: {
      action: 'LOGIN',
      created_at: { gte: since },
      ip_address: { not: null },
    },
    _count: { ip_address: true },
    orderBy: { _count: { ip_address: 'desc' } },
    take: 20,
  });

  // IPs com tentativas de login falhas (audit_logs de FAILED_LOGIN se existir, senão aproximação)
  const failedLoginIps = await prisma.auditLog.groupBy({
    by: ['ip_address'],
    where: {
      entity_type: 'users',
      action: 'LOGIN',
      created_at: { gte: since },
      ip_address: { not: null },
      after_data: { equals: null },
    },
    _count: { ip_address: true },
    orderBy: { _count: { ip_address: 'desc' } },
    take: 20,
  });

  return {
    data: logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    summary: {
      period_hours: hours,
      total_events: total,
      top_ips_by_login: loginAttempts.map((r) => ({
        ip: r.ip_address,
        count: r._count.ip_address,
      })),
      suspicious_ips: failedLoginIps.map((r) => ({
        ip: r.ip_address,
        failed_logins: r._count.ip_address,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

export async function getTenants(query: TenantListQuery) {
  const { page, pageSize, search, plan, blocked } = query;
  const skip = (page - 1) * pageSize;

  const where: NonNullable<Parameters<typeof prisma.tenant.findMany>[0]>['where'] = {
    deleted_at: null,
    ...(plan && { plan }),
    ...(blocked === true && { blocked_at: { not: null } }),
    ...(blocked === false && { blocked_at: null }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        {
          members: {
            some: {
              deleted_at: null,
              user: { email: { contains: search, mode: 'insensitive' } },
            },
          },
        },
      ],
    }),
  };

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        plan_expires_at: true,
        blocked_at: true,
        created_at: true,
        _count: { select: { members: true } },
      },
    }),
    prisma.tenant.count({ where }),
  ]);

  return {
    data: tenants,
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getTenantById(id: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { id, deleted_at: null },
    include: {
      _count: {
        select: {
          members: { where: { deleted_at: null } },
          transactions: { where: { deleted_at: null } },
        },
      },
      members: {
        where: { deleted_at: null },
        include: {
          user: {
            select: { id: true, name: true, email: true, created_at: true },
          },
        },
      },
    },
  });

  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  return tenant;
}

export async function updateTenant(
  tenantId: string,
  data: { plan?: string; name?: string },
  superadminId: string,
) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deleted_at: null },
  });

  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      ...(data.plan && { plan: data.plan as PlanType }),
      ...(data.name && { name: data.name }),
      updated_at: new Date(),
    },
  });

  await createAuditLog({
    prisma,
    tenantId,
    userId: superadminId,
    entityType: 'tenant',
    entityId: tenantId,
    action: 'UPDATE',
    beforeData: { plan: tenant.plan, name: tenant.name },
    afterData: data,
  });

  return updated;
}

export async function blockTenant(
  tenantId: string,
  reason: string,
  superadminId: string,
) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deleted_at: null },
  });

  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  if (tenant.blocked_at) {
    throw new AppError('Tenant is already blocked', 409, 'CONFLICT');
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { blocked_at: new Date() },
  });

  await createAuditLog({
    prisma,
    tenantId,
    userId: superadminId,
    entityType: 'tenant',
    entityId: tenantId,
    action: 'UPDATE',
    beforeData: { blocked_at: null },
    afterData: { blocked_at: new Date().toISOString(), reason },
  });
}

export async function unblockTenant(tenantId: string, superadminId: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deleted_at: null },
  });

  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  if (!tenant.blocked_at) {
    throw new AppError('Tenant is not blocked', 409, 'CONFLICT');
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { blocked_at: null },
  });

  await createAuditLog({
    prisma,
    tenantId,
    userId: superadminId,
    entityType: 'tenant',
    entityId: tenantId,
    action: 'UPDATE',
    beforeData: { blocked_at: tenant.blocked_at.toISOString() },
    afterData: { blocked_at: null },
  });
}

export async function deleteTenant(tenantId: string, superadminId: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deleted_at: null },
  });

  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { deleted_at: new Date() },
  });

  await createAuditLog({
    prisma,
    tenantId,
    userId: superadminId,
    entityType: 'tenant',
    entityId: tenantId,
    action: 'DELETE',
    beforeData: { deleted_at: null },
    afterData: { deleted_at: new Date().toISOString() },
  });
}

export async function impersonateTenant(
  tenantId: string,
  superadminId: string,
) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deleted_at: null, blocked_at: null },
    include: {
      members: {
        where: { role: 'ADMIN', deleted_at: null },
        include: { user: { select: { id: true } } },
        take: 1,
      },
    },
  });

  if (!tenant) {
    throw new NotFoundError('Tenant not found or is blocked/deleted');
  }

  const adminMember = tenant.members[0];
  if (!adminMember) {
    throw new NotFoundError('No ADMIN user found for this tenant');
  }

  const token = signAccessToken({
    userId: adminMember.user.id,
    tenantId: tenant.id,
    role: 'ADMIN',
    // Extra claim: included in the JWT payload via spread
    ...({ impersonated_by: superadminId } as Record<string, string>),
  });

  await createAuditLog({
    prisma,
    tenantId,
    userId: superadminId,
    entityType: 'tenant',
    entityId: tenantId,
    action: 'UPDATE',
    afterData: {
      impersonated_by: superadminId,
      impersonated_user_id: adminMember.user.id,
      at: new Date().toISOString(),
    },
  });

  return { token, expires_in: '15m', impersonated_user_id: adminMember.user.id };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function getUsers(query: UserListQuery) {
  const { page, pageSize, search } = query;
  const skip = (page - 1) * pageSize;

  const where: NonNullable<Parameters<typeof prisma.user.findMany>[0]>['where'] = {
    deleted_at: null,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        created_at: true,
        deleted_at: true,
        tenant_members: {
          where: { deleted_at: null },
          select: {
            role: true,
            tenant: {
              select: { id: true, name: true, plan: true },
            },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data: users,
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function blockUser(userId: string, superadminId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deleted_at: null },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Soft-block: revoke all active refresh tokens as the mechanism
  await prisma.refreshToken.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: new Date() },
  });

  await createAuditLog({
    prisma,
    tenantId: null,
    userId: superadminId,
    entityType: 'user',
    entityId: userId,
    action: 'UPDATE',
    afterData: { blocked_by_superadmin: superadminId, at: new Date().toISOString() },
  });
}

export async function deleteUser(userId: string, superadminId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deleted_at: null },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { deleted_at: new Date() },
  });

  await createAuditLog({
    prisma,
    tenantId: null,
    userId: superadminId,
    entityType: 'user',
    entityId: userId,
    action: 'DELETE',
    beforeData: { deleted_at: null },
    afterData: { deleted_at: new Date().toISOString() },
  });
}

// ---------------------------------------------------------------------------
// Plan features
// ---------------------------------------------------------------------------

export async function getPlanFeatures() {
  return prisma.planFeature.findMany({
    where: { deleted_at: null },
    orderBy: [{ plan: 'asc' }, { feature_key: 'asc' }],
  });
}

export async function upsertPlanFeature(data: FeatureFlagInput) {
  const { plan, feature_key, feature_value } = data;

  const feature = await prisma.planFeature.upsert({
    where: { plan_feature_key: { plan, feature_key } },
    update: { feature_value, deleted_at: null },
    create: { plan, feature_key, feature_value },
  });

  return feature;
}

export async function updatePlanFeatureById(id: string, featureValue: string) {
  const existing = await prisma.planFeature.findFirst({
    where: { id, deleted_at: null },
  });
  if (existing === null) {
    return null;
  }
  return prisma.planFeature.update({
    where: { id },
    data: { feature_value: featureValue },
  });
}

export async function deletePlanFeature(id: string): Promise<boolean> {
  const existing = await prisma.planFeature.findFirst({
    where: { id, deleted_at: null },
  });
  if (existing === null) {
    return false;
  }
  await prisma.planFeature.update({
    where: { id },
    data: { deleted_at: new Date() },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Platform metrics
// ---------------------------------------------------------------------------

export async function getPlatformMetrics() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [paidCount, freeCount, newSignups] = await Promise.all([
    prisma.tenant.count({
      where: { deleted_at: null, plan: 'PAID', plan_expires_at: { gt: now } },
    }),
    prisma.tenant.count({ where: { deleted_at: null, plan: 'FREE' } }),
    prisma.tenant.count({
      where: {
        deleted_at: null,
        created_at: { gte: thirtyDaysAgo },
      },
    }),
  ]);

  const monthlyPriceFeature = await prisma.planFeature.findFirst({
    where: { plan: 'PAID', feature_key: 'monthly_price', deleted_at: null },
  });
  const monthlyPrice = monthlyPriceFeature
    ? parseFloat(monthlyPriceFeature.feature_value)
    : 0;

  const topActiveTenants = await prisma.tenant.findMany({
    where: { deleted_at: null, plan: 'PAID', plan_expires_at: { gt: now } },
    orderBy: { created_at: 'asc' },
    take: 10,
    select: {
      id: true,
      name: true,
      plan: true,
      plan_expires_at: true,
      _count: { select: { transactions: true } },
    },
  });

  return {
    mrr: paidCount * (isNaN(monthlyPrice) ? 0 : monthlyPrice),
    tenants_by_plan: { FREE: freeCount, PAID: paidCount },
    new_signups_last_30_days: newSignups,
    top_active_tenants: topActiveTenants,
  };
}
