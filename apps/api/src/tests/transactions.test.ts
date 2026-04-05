import request from 'supertest';
import app from '../app';

async function bootstrap(): Promise<{ token: string; accountId: string; categoryId: string }> {
  const email = `txn_test_${Date.now()}@example.com`;
  const reg = await request(app).post('/auth/register').send({
    name: 'Txn Test User',
    email,
    password: 'TestPass123!',
  });
  const token = reg.body.data.access_token as string;

  const accRes = await request(app)
    .post('/accounts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Conta Testes', type: 'CHECKING', initial_balance: 5000 });
  const accountId = accRes.body.data.id as string;

  const catRes = await request(app)
    .post('/categories')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Alimentação Teste' });
  const categoryId = catRes.body.data.id as string;

  return { token, accountId, categoryId };
}

describe('Transactions', () => {
  let token: string;
  let accountId: string;
  let categoryId: string;
  let transactionId: string;

  beforeAll(async () => {
    const b = await bootstrap();
    token = b.token;
    accountId = b.accountId;
    categoryId = b.categoryId;
  });

  describe('POST /transactions', () => {
    it('creates an INCOME transaction', async () => {
      const res = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'INCOME',
          status: 'REALIZADO',
          amount: 3000,
          description: 'Salário',
          date: new Date().toISOString(),
          account_id: accountId,
          category_id: categoryId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        type: 'INCOME',
        status: 'REALIZADO',
        amount: '3000',
        description: 'Salário',
      });
      transactionId = res.body.data.id as string;
    });

    it('creates an EXPENSE transaction with PREVISTO status', async () => {
      const res = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'EXPENSE',
          status: 'PREVISTO',
          amount: 150.5,
          description: 'Mercado',
          date: new Date().toISOString(),
          account_id: accountId,
          category_id: categoryId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PREVISTO');
    });

    it('rejects missing required fields', async () => {
      const res = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'EXPENSE', amount: 100 });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /transactions', () => {
    it('lists transactions with pagination', async () => {
      const res = await request(app)
        .get('/transactions?page=1&pageSize=10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
    });

    it('filters by type', async () => {
      const res = await request(app)
        .get('/transactions?type=INCOME')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((t: { type: string }) => t.type === 'INCOME')).toBe(true);
    });

    it('filters by status', async () => {
      const res = await request(app)
        .get('/transactions?status=PREVISTO')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((t: { status: string }) => t.status === 'PREVISTO')).toBe(true);
    });
  });

  describe('PATCH /transactions/:id', () => {
    it('confirms a PREVISTO transaction to REALIZADO', async () => {
      // Create a PREVISTO transaction first
      const createRes = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'EXPENSE',
          status: 'PREVISTO',
          amount: 200,
          description: 'Conta de luz',
          date: new Date().toISOString(),
          account_id: accountId,
        });

      const id = createRes.body.data.id as string;

      const res = await request(app)
        .patch(`/transactions/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'REALIZADO' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REALIZADO');
    });

    it('updates description and notes', async () => {
      const res = await request(app)
        .patch(`/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Salário Atualizado', notes: 'Com bônus' });

      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('Salário Atualizado');
    });
  });

  describe('DELETE /transactions/:id', () => {
    it('soft-deletes a non-reconciled transaction', async () => {
      const createRes = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'EXPENSE',
          status: 'PREVISTO',
          amount: 50,
          description: 'Para deletar',
          date: new Date().toISOString(),
          account_id: accountId,
        });

      const id = createRes.body.data.id as string;

      const res = await request(app)
        .delete(`/transactions/${id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);
    });
  });

  describe('Tenant isolation', () => {
    it('cannot access transactions from another tenant', async () => {
      const otherEmail = `other_${Date.now()}@example.com`;
      const otherReg = await request(app).post('/auth/register').send({
        name: 'Other User',
        email: otherEmail,
        password: 'TestPass123!',
      });
      const otherToken = otherReg.body.data.access_token as string;

      const res = await request(app)
        .get(`/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(404);
    });
  });
});
