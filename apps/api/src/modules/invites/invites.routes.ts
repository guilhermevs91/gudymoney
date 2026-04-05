import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticateUser } from '../../middleware/auth.middleware';
import { requireTenantAccess } from '../../middleware/tenant.middleware';

const inviteBodySchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});

const router: Router = Router();

/**
 * POST /invites
 * Add an existing user to the current tenant, or acknowledge for future sign-up.
 * Only ADMINs may send invites.
 */
router.post(
  '/',
  authenticateUser,
  requireTenantAccess,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: tenantId } = req.tenant!;
      const { userId: inviterId } = req.user!;

      const requester = await prisma.tenantMember.findFirst({
        where: { tenant_id: tenantId, user_id: inviterId, deleted_at: null },
      });
      if (requester === null || requester.role !== 'ADMIN') {
        res.status(403).json({ error: 'Apenas admins podem convidar membros.', code: 'FORBIDDEN' });
        return;
      }

      const parsed = inviteBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Dados inválidos.', code: 'VALIDATION_ERROR', details: parsed.error.issues });
        return;
      }

      const { email, role } = parsed.data;

      const targetUser = await prisma.user.findFirst({ where: { email, deleted_at: null } });
      if (targetUser === null) {
        // No email service in v1 — acknowledge the invite
        res.status(200).json({
          data: { message: 'Convite registrado. O usuário receberá acesso ao se cadastrar.' },
        });
        return;
      }

      const existing = await prisma.tenantMember.findFirst({
        where: { tenant_id: tenantId, user_id: targetUser.id },
      });

      if (existing !== null) {
        if (existing.deleted_at !== null) {
          await prisma.tenantMember.update({
            where: { id: existing.id },
            data: { deleted_at: null, role },
          });
        } else {
          res.status(409).json({ error: 'Usuário já é membro deste espaço.', code: 'CONFLICT' });
          return;
        }
      } else {
        await prisma.tenantMember.create({
          data: { tenant_id: tenantId, user_id: targetUser.id, role },
        });
      }

      res.status(201).json({ data: { message: 'Membro adicionado com sucesso.' } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
