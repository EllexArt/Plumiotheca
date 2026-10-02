import request from 'supertest';
import app from '../src/app';

const ALLOWED_ORIGIN = 'http://localhost:5000';

describe('CORS middleware', () => {
  it('should allow a request coming from a micro-frontend', async () => {
    const response = await request(app).get('/').set('Origin', ALLOWED_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(response.headers['vary']).toContain('Origin');
  });

  it('should answer a preflight request without hitting authentication', async () => {
    const response = await request(app)
      .options('/api/stories')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Authorization');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-headers']).toContain('Authorization');
  });

  it('should not expose the API to an unknown origin', async () => {
    const response = await request(app).get('/').set('Origin', 'http://evil.example.com');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
