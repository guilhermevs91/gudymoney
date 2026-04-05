import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';

async function bootstrap(): Promise<{ token: string; categoryId: string }> {
  const email = `budget_test_${Date.now()}@example.com`;
  const reg = await request(app).post('/auth/register').send({
    name: 'Budget Test User',
    email,
    password: 'TestPass123!',
  });
  const token = reg.body.data.access_token as string;
  const tenantId = reg.body.data.tenant.id as string;

  // Upgrade to PAID plan so budget endpoints are accessible
  await prisma.tenant.update({ where: { id: tenantId }, data: { plan: 'PAID' } });

  // Use first seeded category
  const catRes = await request(app)
    .get('/categories')
    .set('Authorization', `Bearer ${token}`);
  const categoryId = catRes.body.data[0].id as string;

  return { token, categoryId };
}

describe('Budgets', () => {
  let token: string;
  let categoryId: string;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  beforeAll(async () => {
    const b = await bootstrap();
    token = b.token;
    categoryId = b.categoryId;
  });

  describe('PUT /budgets (upsert)', () => {
    it('creates a budget for the current month', async () => {
      const res = await request(app)
        .put('/budgets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          year,
          month,
          items: [{ category_id: categoryId, planned_amount: 1500 }],
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ year, month });
      expect(res.body.data.budget_items).toBeInstanceOf(Array);
      expect(res.body.data.budget_items.length).toBeGreaterThanOrEqual(1);
    });

    it('upserts (updates) the same month without conflict', async () => {
      const res = await request(app)
        .put('/budgets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          year,
          month,
          items: [
            { category_id: categoryId, planned_amount: 2000 },
          ],
        });

      expect(res.status).toBe(200);
      expect(Number(res.body.data.budget_items[0].planned_amount)).toBe(2000);
    });

    it('rejects missing required fields', async () => {
      const res = await request(app)
        .put('/budgets')
        .set('Authorization', `Bearer ${token}`)
        .send({ year });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /budgets', () => {
    it('returns budget for year+month', async () => {
      const res = await request(app)
        .get(`/budgets?year=${year}&month=${month}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ year, month });
    });

    it('requires year and month query params', async () => {
      const res = await request(app)
        .get('/budgets')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /budgets/scope', () => {
    it('changes budget scope to TENANT', async () => {
      const res = await request(app)
        .patch('/budgets/scope')
        .set('Authorization', `Bearer ${token}`)
        .send({ budget_scope: 'TENANT' });

      expect(res.status).toBe(200);
    });
  });
});
