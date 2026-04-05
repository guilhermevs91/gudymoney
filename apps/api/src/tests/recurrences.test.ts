import request from 'supertest';
import app from '../app';

async function bootstrap(): Promise<{ token: string; accountId: string; categoryId: string }> {
  const email = `rec_test_${Date.now()}@example.com`;
  const reg = await request(app).post('/auth/register').send({
    name: 'Rec Test User',
    email,
    password: 'TestPass123!',
  });
  const token = reg.body.data.access_token as string;

  const accRes = await request(app)
    .post('/accounts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Conta Recorrências', type: 'CHECKING', initial_balance: 5000 });
  const accountId = accRes.body.data.id as string;

  const catRes = await request(app)
    .get('/categories')
    .set('Authorization', `Bearer ${token}`);
  const categoryId = catRes.body.data[0].id as string;

  return { token, accountId, categoryId };
}

describe('Recurrences', () => {
  let token: string;
  let accountId: string;
  let categoryId: string;
  let recurrenceId: string;

  beforeAll(async () => {
    const b = await bootstrap();
    token = b.token;
    accountId = b.accountId;
    categoryId = b.categoryId;
  });

  describe('POST /recurrences', () => {
    it('creates a monthly recurrence', async () => {
      const startDate = new Date().toISOString().split('T')[0]!;
      const endDate = new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

      const res = await request(app)
        .post('/recurrences')
        .set('Authorization', `Bearer ${token}`)
        .send({
          description: 'Aluguel',
          type: 'EXPENSE',
          amount: 1200,
          frequency: 'MONTHLY',
          start_date: startDate,
          end_date: endDate,
          account_id: accountId,
          category_id: categoryId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        description: 'Aluguel',
        frequency: 'MONTHLY',
      });
      recurrenceId = res.body.data.id as string;
    });

    it('creates a weekly recurrence', async () => {
      const startDate = new Date().toISOString().split('T')[0]!;
      const endDate = new Date(Date.now() + 3 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

      const res = await request(app)
        .post('/recurrences')
        .set('Authorization', `Bearer ${token}`)
        .send({
          description: 'Mercado semanal',
          type: 'EXPENSE',
          amount: 300,
          frequency: 'WEEKLY',
          start_date: startDate,
          end_date: endDate,
          account_id: accountId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.frequency).toBe('WEEKLY');
    });

    it('rejects missing required fields', async () => {
      const res = await request(app)
        .post('/recurrences')
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Incompleto' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /recurrences', () => {
    it('lists recurrences', async () => {
      const res = await request(app)
        .get('/recurrences')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by active status', async () => {
      const res = await request(app)
        .get('/recurrences?active=true')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(
        res.body.data.every((r: { is_active: boolean }) => r.is_active === true),
      ).toBe(true);
    });
  });

  describe('PATCH /recurrences/:id', () => {
    it('updates recurrence amount', async () => {
      const res = await request(app)
        .patch(`/recurrences/${recurrenceId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 1500 });

      expect(res.status).toBe(200);
      expect(Number(res.body.data.amount)).toBe(1500);
    });

    it('deactivates a recurrence', async () => {
      const res = await request(app)
        .patch(`/recurrences/${recurrenceId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ is_active: false });

      expect(res.status).toBe(200);
      expect(res.body.data.is_active).toBe(false);
    });
  });

  describe('DELETE /recurrences/:id', () => {
    it('soft-deletes a recurrence', async () => {
      // Create a disposable recurrence first
      const startDate = new Date().toISOString().split('T')[0]!;
      const endDate = new Date(Date.now() + 3 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
      const createRes = await request(app)
        .post('/recurrences')
        .set('Authorization', `Bearer ${token}`)
        .send({
          description: 'Para Deletar',
          type: 'EXPENSE',
          amount: 100,
          frequency: 'MONTHLY',
          start_date: startDate,
          end_date: endDate,
          account_id: accountId,
        });

      const id = createRes.body.data.id as string;

      const res = await request(app)
        .delete(`/recurrences/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ future_action: 'CANCEL' });

      expect(res.status).toBe(204);
    });
  });

  describe('Tenant isolation', () => {
    it('cannot access another tenant recurrence', async () => {
      const otherEmail = `other_rec_${Date.now()}@example.com`;
      const otherReg = await request(app).post('/auth/register').send({
        name: 'Other Rec User',
        email: otherEmail,
        password: 'TestPass123!',
      });
      const otherToken = otherReg.body.data.access_token as string;

      const res = await request(app)
        .get(`/recurrences/${recurrenceId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(404);
    });
  });
});
