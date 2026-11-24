import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

// Regresiones del código inicial (ver docs/PROBLEMAS.md): sin base ni red.
let boots = 0;
async function boot(storage = {}) {
  const dom = new JSDOM(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'), {
    url: 'http://localhost',
  });
  for (const [key, value] of Object.entries(storage)) dom.window.localStorage.setItem(key, value);
  for (const key of ['document', 'localStorage', 'Option']) globalThis[key] = dom.window[key];
  dom.window.document.querySelector('#table-dialog').close = () => {};
  // Query única: cada prueba ejecuta app.js de nuevo sobre su propio DOM.
  await import(`../public/app.js?boot=${boots++}`);
  return dom;
}

test('capacidad 20 es válida, 21 no, y la búsqueda ignora mayúsculas', async () => {
  const dom = await boot();
  const { document } = dom.window;
  const $ = (selector) => document.querySelector(selector);
  const fire = (selector, type) =>
    $(selector).dispatchEvent(new dom.window.Event(type, { cancelable: true }));
  const create = (name, capacity) => {
    $('#table-name').value = name;
    $('#table-capacity').value = String(capacity);
    fire('#table-form', 'submit');
  };
  create('Salón 20', 21);
  assert.notEqual($('#form-error').textContent, '');
  assert.equal(document.querySelectorAll('.table-card').length, 6);
  create('Salón 20', 20);
  assert.equal($('#form-error').textContent, '');
  assert.equal(document.querySelectorAll('.table-card').length, 7);
  create('SALÓN 20', 2); // Duplicado sin distinguir mayúsculas.
  assert.notEqual($('#form-error').textContent, '');
  for (const [query, expected] of [
    ['MESA 0', 4],
    ['terraza', 2],
    ['TeRrAzA 01', 1],
    ['SALÓN', 1],
  ]) {
    $('#search').value = query;
    fire('#search', 'input');
    assert.equal(document.querySelectorAll('.table-card').length, expected, query);
  }
  dom.window.close();
});

test('el idioma elegido se conserva al recargar', async () => {
  const dom = await boot();
  const { localStorage } = dom.window;
  const { locale, applyLanguage } = await import('../public/i18n.js');
  applyLanguage('ru');
  assert.equal(localStorage.getItem('reservet.language'), 'ru');
  // Simula una recarga: módulo nuevo leyendo el mismo almacenamiento.
  const reloaded = await import('../public/i18n.js?reload');
  assert.equal(locale(), 'ru');
  assert.equal(reloaded.locale(), 'ru');
  dom.window.close();
});

test('en modo API una respuesta 401 muestra el login y no cae a datos de demostración', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const dom = await boot({ 'reservet.source': 'api' });
  const { document } = dom.window;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(document.querySelector('#login-panel').hidden, false);
  assert.equal(document.querySelector('#app-view').hidden, true);
  assert.equal(document.querySelector('#logout').hidden, true);
  assert.equal(document.querySelectorAll('.table-card').length, 0);
  dom.window.close();
});
