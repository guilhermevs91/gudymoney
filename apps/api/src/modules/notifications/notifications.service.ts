import type { Notification, NotificationType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListNotificationsQuery {
  read?: boolean;
  page: number;
  pageSize: number;
}

export interface CreateNotificationData {
  tenant_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const notificationsService = {
  /**
   * List paginated notifications for a user, ordered by created_at desc.
   */
  async listNotifications(
    tenantId: string,
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<{ data: Notification[]; total: number; page: number; pageSize: number }> {
    const { read, page, pageSize } = query;

    const where: {
      tenant_id: string;
      user_id: string;
      deleted_at: null;
      read_at?: { not: null } | null;
    } = {
      tenant_id: tenantId,
      user_id: userId,
      deleted_at: null,
    };

    if (read === true) {
      where.read_at = { not: null };
    } else if (read === false) {
      where.read_at = null;
    }

    const skip = (page - 1) * pageSize;

    const [notifications, total] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    return { data: notifications, total, page, pageSize };
  },

  /**
   * Mark a single notification as read.
   */
  async markAsRead(
    id: string,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const notification = await prisma.notification.findFirst({
      where: { id, tenant_id: tenantId, user_id: userId, deleted_at: null },
    });

    if (notification === null) {
      throw new NotFoundError('Notificação não encontrada.');
    }

    await prisma.notification.update({
      where: { id },
      data: { read_at: new Date() },
    });
  },

  /**
   * Mark all unread notifications for a user as read.
   */
  async markAllAsRead(tenantId: string, userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        deleted_at: null,
        read_at: null,
      },
      data: { read_at: new Date() },
    });
  },

  /**
   * Soft-delete a notification.
   */
  async deleteNotification(
    id: string,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const notification = await prisma.notification.findFirst({
      where: { id, tenant_id: tenantId, user_id: userId, deleted_at: null },
    });

    if (notification === null) {
      throw new NotFoundError('Notificação não encontrada.');
    }

    await prisma.notification.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  },

  /**
   * Create a notification — internal, called from cron jobs and other services.
   */
  async createNotification(data: CreateNotificationData): Promise<Notification> {
    return prisma.notification.create({
      data: {
        tenant_id: data.tenant_id,
        user_id: data.user_id,
        type: data.type as NotificationType,
        title: data.title,
        body: data.body,
        metadata: (data.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  },

  /**
   * Get the count of unread notifications for a user.
   */
  async getUnreadCount(tenantId: string, userId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        deleted_at: null,
        read_at: null,
      },
    });
  },
};
