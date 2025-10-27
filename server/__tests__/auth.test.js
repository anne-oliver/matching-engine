const request = require('supertest');
const { makeApp } = require('../api/server.js');
const { open } = require('../db');
const { authRequired } = require('../middleware/auth.js');

describe('Auth API', () => {
  let app;
  let db;
  let agent;

  beforeEach(() => {
    process.env.AUTH_BYPASS = 'false';
    db = open({ filename: ':memory:' })
    app = makeApp(db);
    agent = request.agent(app); // keeps cookies between requests
  });

  afterEach(() => {
    db.close();
  });

  // ---------- Registration ----------
  describe('registration', () => {
    test('rejects short username or password', () => {
      return Promise.all([
        request(app).post('/registration')
          .send({ username: 'ab', password: 'validpass123' })
          .expect(400),
        request(app).post('/registration')
          .send({ username: 'validname', password: '123' })
          .expect(400)
      ]);
    });

    test('rejects duplicate username', () => {
      return request(app).post('/registration')
        .send({ username: 'user1', password: 'password123' })
        .expect(201)
        .then(() =>
          request(app).post('/registration')
            .send({ username: 'user1', password: 'password123' })
            .expect(409)
        );
    });

    test('creates user and returns 201 with cookie + user object', () => {
      return request(app).post('/registration')
        .send({ username: 'newuser', password: 'password123' })
        .expect(201)
        .then(res => {
          expect(res.body.user.username).toBe('newuser');
          // cookie should be set
          const cookies = res.headers['set-cookie'];
          expect(cookies).toBeDefined();
          const row = db.findUserByUsername('newuser');
          expect(row).toBeTruthy();
          expect(row.password_hash).not.toBe('password123');
        });
    });
  });

  // ---------- Login ----------
  describe('login', () => {
    test('rejects invalid credentials', () => {
      return request(app).post('/login')
        .send({ username: 'nouser', password: 'password123' })
        .expect(401);
    });

    test('logs in existing user and sets session', () => {
      const username = 'testlogin';
      const password = 'secret123';
      // Create the user first
      return request(app).post('/registration')
        .send({ username, password })
        .expect(201)
        .then(() =>
          agent.post('/login').send({ username, password }).expect(200)
        )
        .then(res => {
          expect(res.body.user.username).toBe(username);
          return agent.get('/me').expect(200);
        })
        .then(res2 => {
          expect(res2.body.user.username).toBe(username);
        });
    });
  });

  // ---------- Cookie persistence ----------
  describe('cookie persistence', () => {
    test('retains session across requests', () => {
      return agent.post('/registration')
        .send({ username: 'persist', password: 'password123' })
        .expect(201)
        .then(() => agent.get('/me').expect(200))
        .then(res => {
          expect(res.body.user.username).toBe('persist');
        });
    });
  });

  // ---------- AuthRequired ----------
  describe('authRequired', () => {

    test('blocks request without session', () => {
      const req = {}; // no session info
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      authRequired(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'login required' });
      expect(next).not.toHaveBeenCalled();

    });

    test('allows request with session.user', () => {
      const req = { session: { user: { id: 1, username: 'test' } } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      authRequired(req, res, next);
      expect(req.session.user).toBeDefined()
      expect(next).toHaveBeenCalled();
    });
  });

  // ---------- Logout ----------
  describe('logout', () => {
    test('destroys session and blocks subsequent access', () => {
      return agent.post('/registration')
        .send({ username: 'logoutuser', password: 'abc123456' })
        .expect(201)
        .then(() => agent.post('/logout').expect(204))
        .then(() => agent.get('/me').expect(401));
    });
  });
});