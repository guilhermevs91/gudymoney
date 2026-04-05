import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticateUser } from '../../middleware/auth.middleware';
import { requireTenantAccess } from '../../middleware/tenant.middleware';

const router: Router = Router();

/** GET /members — list all tenant members */
router.get(
  '/',
  authenticateUser,
  requireTenantAccess,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: tenantId } = req.tenant!;
      const members = await prisma.tenantMember.findMany({
        where: { tenant_id: tenantId, deleted_at: null },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { created_at: 'asc' },
      });
      res.status(200).json({ data: members });
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /members/:id — soft-delete a tenant member (admin only) */
router.delete(
  '/:id',
  authenticateUser,
  requireTenantAccess,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: tenantId } = req.tenant!;
      const { userId } = req.user!;

      const requester = await prisma.tenantMember.findFirst({
        where: { tenant_id: tenantId, user_id: userId, deleted_at: null },
      });
      if (requester === null || requester.role !== 'ADMIN') {
        res.status(403).json({ error: 'Apenas admins podem remover membros.', code: 'FORBIDDEN' });
        return;
      }

      const memberId = req.params.id as string;
      const member = await prisma.tenantMember.findFirst({
        where: { id: memberId, tenant_id: tenantId, deleted_at: null },
      });
      if (member === null) {
        res.status(404).json({ error: 'Membro não encontrado.', code: 'NOT_FOUND' });
        return;
      }
      if (member.role === 'ADMIN') {
        res.status(403).json({ error: 'Não é possível remover um admin.', code: 'FORBIDDEN' });
        return;
      }

      await prisma.tenantMember.update({
        where: { id: memberId },
        data: { deleted_at: new Date() },
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
