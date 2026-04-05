import request from 'supertest';
import app from '../app';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createUserAndToken(): Promise<{ token: string; tenantId: string }> {
  const email = `acc_test_${Date.now()}@example.com`;
  const res = await request(app).post('/auth/register').send({
    name: 'Acc Test User',
    email,
    password: 'TestPass123!',
  });
  return {
    token: res.body.data.access_token as string,
    tenantId: res.body.data.tenant.id as string,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Accounts', () => {
  let token: string;

  beforeAll(async () => {
    const result = await createUserAndToken();
    token = result.token;
  });

  describe('GET /accounts', () => {
    it('returns an empty list for new tenant', async () => {
      const res = await request(app)
        .get('/accounts')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/accounts');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /accounts', () => {
    it('creates a checking account', async () => {
      const res = await request(app)
        .post('/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Conta Corrente BB',
          type: 'CHECKING',
          initial_balance: 1000.0,
          bank_name: 'Banco do Brasil',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        name: 'Conta Corrente BB',
        type: 'CHECKING',
      });
    });

    it('creates a savings account', async () => {
      const res = await request(app)
        .post('/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Poupança',
          type: 'SAVINGS',
          initial_balance: 500.0,
        });

      expect(res.status).toBe(201);
    });

    it('rejects invalid account type', async () => {
      const res = await request(app)
        .post('/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Conta Inválida',
          type: 'INVALID',
          initial_balance: 0,
        });

      expect(res.status).toBe(400);
    });

    it('rejects missing name', async () => {
      const res = await request(app)
        .post('/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'CHECKING', initial_balance: 0 });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /accounts/:id', () => {
    let accountId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Para Editar', type: 'WALLET', initial_balance: 0 });
      accountId = res.body.data.id as string;
    });

    it('updates account name', async () => {
      const res = await request(app)
        .patch(`/accounts/${accountId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Editada com Sucesso' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Editada com Sucesso');
    });

    it('returns 404 for non-existent account', async () => {
      const res = await request(app)
        .patch('/accounts/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'X' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /accounts/:id', () => {
    let accountId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Para Deletar', type: 'WALLET', initial_balance: 0 });
      accountId = res.body.data.id as string;
    });

    it('soft-deletes an account', async () => {
      const res = await request(app)
        .delete(`/accounts/${accountId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);
    });

    it('returns 404 after deletion', async () => {
      const res = await request(app)
        .get(`/accounts/${accountId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
