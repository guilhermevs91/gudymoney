import request from 'supertest';
import app from '../app';

async function bootstrap(): Promise<{ token: string }> {
  const email = `cat_test_${Date.now()}@example.com`;
  const reg = await request(app).post('/auth/register').send({
    name: 'Cat Test User',
    email,
    password: 'TestPass123!',
  });
  return { token: reg.body.data.access_token as string };
}

describe('Categories', () => {
  let token: string;
  let createdId: string;

  beforeAll(async () => {
    const b = await bootstrap();
    token = b.token;
  });

  describe('GET /categories', () => {
    it('returns seeded categories on a new tenant', async () => {
      const res = await request(app)
        .get('/categories')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      // 8 default seed categories
      expect(res.body.data.length).toBeGreaterThanOrEqual(8);
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/categories');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /categories', () => {
    it('creates a custom category', async () => {
      const res = await request(app)
        .post('/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Investimentos', color: '#22C55E' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        name: 'Investimentos',
        color: '#22C55E',
      });
      createdId = res.body.data.id as string;
    });

    it('rejects missing name', async () => {
      const res = await request(app)
        .post('/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ color: '#fff' });

      expect(res.status).toBe(400);
    });

    it('creates a sub-category', async () => {
      const res = await request(app)
        .post('/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Ações', parent_id: createdId });

      expect(res.status).toBe(201);
      expect(res.body.data.parent_id).toBe(createdId);
    });
  });

  describe('PATCH /categories/:id', () => {
    it('updates category name', async () => {
      const res = await request(app)
        .patch(`/categories/${createdId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Investimentos Atualizados' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Investimentos Atualizados');
    });
  });

  describe('DELETE /categories/:id', () => {
    it('soft-deletes a custom category', async () => {
      const createRes = await request(app)
        .post('/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Para Deletar' });

      const id = createRes.body.data.id as string;

      const res = await request(app)
        .delete(`/categories/${id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);
    });
  });

  describe('Tenant isolation', () => {
    it('cannot access categories from another tenant', async () => {
      const otherEmail = `other_cat_${Date.now()}@example.com`;
      const otherReg = await request(app).post('/auth/register').send({
        name: 'Other Cat User',
        email: otherEmail,
        password: 'TestPass123!',
      });
      const otherToken = otherReg.body.data.access_token as string;

      const res = await request(app)
        .get(`/categories/${createdId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(404);
    });
  });
});
