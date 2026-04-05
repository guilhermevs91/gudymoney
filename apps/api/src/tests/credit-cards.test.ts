import request from 'supertest';
import app from '../app';

async function bootstrap(): Promise<{ token: string }> {
  const email = `cc_test_${Date.now()}@example.com`;
  const reg = await request(app).post('/auth/register').send({
    name: 'CC Test User',
    email,
    password: 'TestPass123!',
  });
  return { token: reg.body.data.access_token as string };
}

describe('Credit Cards', () => {
  let token: string;
  let cardId: string;

  beforeAll(async () => {
    const b = await bootstrap();
    token = b.token;
  });

  describe('POST /credit-cards', () => {
    it('creates a credit card', async () => {
      const res = await request(app)
        .post('/credit-cards')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Nubank',
          last_four: '1234',
          limit_total: 5000,
          closing_day: 15,
          due_day: 22,
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ name: 'Nubank', last_four: '1234' });
      cardId = res.body.data.id as string;
    });

    it('rejects missing required fields', async () => {
      const res = await request(app)
        .post('/credit-cards')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Incompleto' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /credit-cards', () => {
    it('lists credit cards', async () => {
      const res = await request(app)
        .get('/credit-cards')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /credit-cards/:id', () => {
    it('returns a single card', async () => {
      const res = await request(app)
        .get(`/credit-cards/${cardId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(cardId);
    });

    it('returns 404 for unknown card', async () => {
      const res = await request(app)
        .get('/credit-cards/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /credit-cards/:id', () => {
    it('updates card name', async () => {
      const res = await request(app)
        .patch(`/credit-cards/${cardId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Nubank Atualizado' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Nubank Atualizado');
    });
  });

  describe('GET /credit-cards/:id/invoices', () => {
    it('returns invoice list for a card', async () => {
      const res = await request(app)
        .get(`/credit-cards/${cardId}/invoices`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });
  });

  describe('Tenant isolation', () => {
    it('cannot access another tenant card', async () => {
      const otherEmail = `other_cc_${Date.now()}@example.com`;
      const otherReg = await request(app).post('/auth/register').send({
        name: 'Other CC User',
        email: otherEmail,
        password: 'TestPass123!',
      });
      const otherToken = otherReg.body.data.access_token as string;

      const res = await request(app)
        .get(`/credit-cards/${cardId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(404);
    });
  });
});
