import 'dotenv/config';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

// Integración contra PostgreSQL REAL (nada simulado). Requiere TEST_DATABASE_URL.
const testUrl = process.env.TEST_DATABASE_URL;
const skip = testUrl ? false : 'TEST_DATABASE_URL no definida: se omiten las pruebas con base real';
if (testUrl && !/_test$/.test(new URL(testUrl).pathname.slice(1))) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en _test.');
}

const USER = { username: 'tester', password: 'test-password-123' };
let app, pool, server, base, upsertUser, hashPassword, runMigrations;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = testUrl; // La app solo ve la base de pruebas.
  ({ app } = await import('../src/app.ts'));
  ({ pool } = await import('../src/shared/database.ts'));
  ({ runMigrations } = await import('../src/shared/migrations.ts'));
  ({ upsertUser } = await import('../src/modules/auth/auth.repository.ts'));
  ({ hashPassword } = await import('../src/modules/auth/auth.password.ts'));
  await runMigrations(pool);
  await upsertUser(USER.username, await hashPassword(USER.password));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  if (skip) return;
  await pool.query('TRUNCATE restaurant_tables RESTART IDENTITY');
  await pool.query('DELETE FROM sessions');
});
after(async () => {
  if (skip) return;
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function api(method, path, { body, cookie } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    setCookie: response.headers.getSetCookie().join('; '),
    raw: text,
  };
}
async function login() {
  const response = await api('POST', '/api/auth/login', { body: USER });
  assert.equal(response.status, 200);
  return response.setCookie.split(';')[0];
}

test(
  'sin sesión todos los endpoints de mesas responden 401; salud sigue pública',
  { skip },
  async () => {
    for (const [method, path, body] of [
      ['GET', '/api/tables'],
      ['POST', '/api/tables', { name: 'X', capacity: 2 }],
      ['PATCH', '/api/tables/1/status', { status: 'occupied' }],
      ['GET', '/api/auth/me'],
    ]) {
      assert.equal((await api(method, path, { body })).status, 401, `${method} ${path}`);
    }
    assert.equal((await api('GET', '/health')).status, 200);
    const forged = await api('GET', '/api/tables', { cookie: 'reservet_session=token-falso' });
    assert.equal(forged.status, 401);
  },
);

test('login incorrecto da 401 genérico; datos mal formados dan 400', { skip }, async () => {
  const wrongPassword = await api('POST', '/api/auth/login', {
    body: { username: USER.username, password: 'incorrecta' },
  });
  const unknownUser = await api('POST', '/api/auth/login', {
    body: { username: 'no-existe', password: 'incorrecta' },
  });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownUser.status, 401);
  assert.equal(wrongPassword.body.message, unknownUser.body.message);
  assert.equal(wrongPassword.setCookie, '');
  for (const body of [{}, { username: 'tester' }, { username: 1, password: 2 }, []]) {
    assert.equal((await api('POST', '/api/auth/login', { body })).status, 400);
  }
});

test(
  'login correcto: cookie HttpOnly/SameSite, sesión actual y contraseña con hash',
  { skip },
  async () => {
    const response = await api('POST', '/api/auth/login', {
      body: { username: ` ${USER.username.toUpperCase()} `, password: USER.password },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body.user).sort(), ['id', 'username']);
    assert.match(response.setCookie, /HttpOnly/i);
    assert.match(response.setCookie, /SameSite=Strict/i);
    const cookie = response.setCookie.split(';')[0];
    const me = await api('GET', '/api/auth/me', { cookie });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.username, USER.username);
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE username = $1', [
      USER.username,
    ]);
    assert.match(rows[0].password_hash, /^scrypt\$/);
    assert.ok(!rows[0].password_hash.includes(USER.password));
    const stored = await pool.query('SELECT token_hash FROM sessions');
    assert.ok(!cookie.includes(stored.rows[0].token_hash), 'la BD no guarda el token en claro');
  },
);

test(
  'logout revoca la sesión en el servidor y una sesión caducada se rechaza',
  { skip },
  async () => {
    const cookie = await login();
    assert.equal((await api('GET', '/api/tables', { cookie })).status, 200);
    const out = await api('POST', '/api/auth/logout', { cookie });
    assert.equal(out.status, 204);
    assert.match(out.setCookie, /reservet_session=;/);
    assert.equal((await api('GET', '/api/tables', { cookie })).status, 401, 'token reutilizado');
    assert.equal((await api('GET', '/api/auth/me', { cookie })).status, 401);
    const second = await login();
    await pool.query("UPDATE sessions SET expires_at = now() - interval '1 second'");
    assert.equal((await api('GET', '/api/tables', { cookie: second })).status, 401, 'caducada');
  },
);

test('crear, listar y cambiar estado persisten en PostgreSQL', { skip }, async () => {
  const cookie = await login();
  assert.deepEqual((await api('GET', '/api/tables', { cookie })).body, []);
  const created = await api('POST', '/api/tables', {
    cookie,
    body: { name: '  Mesa 1 ', capacity: 4 },
  });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body, { id: 1, name: 'Mesa 1', capacity: 4, status: 'available' });
  await api('POST', '/api/tables', { cookie, body: { name: 'Terraza', capacity: 20 } });
  const patched = await api('PATCH', '/api/tables/1/status', {
    cookie,
    body: { status: 'occupied' },
  });
  assert.equal(patched.status, 200);
  assert.deepEqual(patched.body, { id: 1, name: 'Mesa 1', capacity: 4, status: 'occupied' });
  const { rows } = await pool.query(
    'SELECT name, capacity, status FROM restaurant_tables ORDER BY id',
  );
  assert.deepEqual(rows, [
    { name: 'Mesa 1', capacity: 4, status: 'occupied' },
    { name: 'Terraza', capacity: 20, status: 'available' },
  ]);
  // Una sesión nueva ve los mismos datos: no dependen de memoria del proceso.
  const list = await api('GET', '/api/tables', { cookie: await login() });
  assert.deepEqual(
    list.body.map((t) => [t.id, t.status]),
    [
      [1, 'occupied'],
      [2, 'available'],
    ],
  );
});

test('validaciones: nombre, capacidad (límites 1 y 20), estado e ID', { skip }, async () => {
  const cookie = await login();
  const post = (body) => api('POST', '/api/tables', { cookie, body });
  for (const body of [
    { name: '', capacity: 2 },
    { name: '   ', capacity: 2 },
    { name: 'a'.repeat(81), capacity: 2 },
    { name: 5, capacity: 2 },
    { name: 'Ok' },
    { name: 'Ok', capacity: 0 },
    { name: 'Ok', capacity: 21 },
    { name: 'Ok', capacity: 2.5 },
    { name: 'Ok', capacity: '4' },
    [],
  ]) {
    assert.equal((await post(body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await post({ name: 'a'.repeat(80), capacity: 1 })).status, 201);
  assert.equal((await post({ name: 'Grande', capacity: 20 })).status, 201);
  const patch = (id, body) => api('PATCH', `/api/tables/${id}/status`, { cookie, body });
  for (const id of ['abc', '0', '-1', '1.5', '99999999999999999999', '2147483648']) {
    assert.equal((await patch(id, { status: 'occupied' })).status, 400, `id ${id}`);
  }
  for (const body of [{ status: 'broken' }, { status: 1 }, {}, []]) {
    assert.equal((await patch(1, body)).status, 400, JSON.stringify(body));
  }
});

test(
  'mesa inexistente da 404 y nombre duplicado da 409 sin filtrar detalles internos',
  { skip },
  async () => {
    const cookie = await login();
    const missing = await api('PATCH', '/api/tables/12345/status', {
      cookie,
      body: { status: 'occupied' },
    });
    assert.equal(missing.status, 404);
    await api('POST', '/api/tables', { cookie, body: { name: 'Mesa 1', capacity: 2 } });
    for (const name of ['Mesa 1', 'mesa 1', '  MESA 1  ']) {
      const duplicate = await api('POST', '/api/tables', { cookie, body: { name, capacity: 3 } });
      assert.equal(duplicate.status, 409, name);
      assert.doesNotMatch(duplicate.raw, /constraint|INSERT|SELECT|stack|restaurant_tables/i);
    }
    assert.equal((await api('GET', '/api/tables', { cookie })).body.length, 1);
  },
);
