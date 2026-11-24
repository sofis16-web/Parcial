import { test } from 'node:test';
import assert from 'node:assert/strict';
const { hashPassword, verifyPassword } = await import('../src/modules/auth/auth.password.ts');

test('el hash usa scrypt con sal propia y nunca contiene la contraseña', async () => {
  const [a, b] = await Promise.all([
    hashPassword('clave-segura-1'),
    hashPassword('clave-segura-1'),
  ]);
  assert.match(a, /^scrypt\$\d+\$\d+\$\d+\$/);
  assert.ok(!a.includes('clave-segura-1'));
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('clave-segura-1', a), true);
  assert.equal(await verifyPassword('otra-clave', a), false);
});

test('un hash malformado o desconocido se rechaza sin lanzar errores', async () => {
  for (const stored of ['', 'texto-plano', 'md5$a$b', 'scrypt$x$y$z$AAAA$BBBB', 'scrypt$1$1$1$$']) {
    assert.equal(await verifyPassword('x', stored), false);
  }
});
