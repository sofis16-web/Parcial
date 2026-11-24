import { t, locale, applyLanguage } from './i18n.js';
// El modo demo es temporal y nunca escribe en PostgreSQL.
// El modo API utiliza el contrato del primer ejercicio, sin sustituirlo por datos falsos.
const $ = (selector) => document.querySelector(selector);
const statuses = ['available', 'occupied', 'out_of_service'];
let lastNotice = null;
let formError = null;
const translatedError = (key, values = {}) =>
  Object.assign(new Error(t(key, values)), { key, values });
const showFormError = (error = null) => {
  formError = error;
  $('#form-error').textContent = error
    ? error.key
      ? t(error.key, error.values)
      : error.message
    : '';
};
const displayName = (table) =>
  isDemo() && table.demoKey ? `${t(table.demoKey)} ${table.demoNumber}` : table.name;
let demoTables = [
  {
    id: 1,
    name: 'Mesa 01',
    demoKey: 'tableName',
    demoNumber: '01',
    capacity: 2,
    status: 'available',
  },
  {
    id: 2,
    name: 'Mesa 02',
    demoKey: 'tableName',
    demoNumber: '02',
    capacity: 4,
    status: 'occupied',
  },
  {
    id: 3,
    name: 'Mesa 03',
    demoKey: 'tableName',
    demoNumber: '03',
    capacity: 4,
    status: 'available',
  },
  {
    id: 4,
    name: 'Terraza 01',
    demoKey: 'terrace',
    demoNumber: '01',
    capacity: 6,
    status: 'available',
  },
  {
    id: 5,
    name: 'Terraza 02',
    demoKey: 'terrace',
    demoNumber: '02',
    capacity: 2,
    status: 'occupied',
  },
  {
    id: 6,
    name: 'Mesa 06',
    demoKey: 'tableName',
    demoNumber: '06',
    capacity: 8,
    status: 'out_of_service',
  },
];
let tables = [];
let currentUser = null;
let showingLogin = false;
let loginError = null;
let busy = false;
let loadError = '';
const isDemo = () => $('#source').value === 'demo';
const notice = (key = '', error = false, values = {}) => {
  lastNotice = { key, error, values };
  $('#notice').textContent = key ? t(key, values) : '';
  $('#notice').className = `notice${error ? ' error' : ''}`;
};

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    throw translatedError('connectionError');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 404) throw translatedError('notFound', { path });
    if (response.status === 401) throw translatedError('sessionRequired');
    if (response.status === 400) throw translatedError('serverValidation');
    throw translatedError(response.status === 409 ? 'duplicate' : 'httpError', {
      status: response.status,
    });
  }
  return body;
}

function validTable(table) {
  return (
    table &&
    Number.isInteger(table.id) &&
    table.id > 0 &&
    typeof table.name === 'string' &&
    table.name.trim().length > 0 &&
    table.name.length <= 80 &&
    Number.isInteger(table.capacity) &&
    table.capacity >= 1 &&
    table.capacity <= 20 &&
    statuses.includes(table.status)
  );
}

function setBusy(value) {
  busy = value;
  for (const selector of [
    '#source',
    '#refresh',
    '#new-table',
    '#save-table',
    '#close-dialog',
    '#cancel-dialog',
    '#login-submit',
    '#logout',
  ])
    $(selector).disabled = value;
  $('#tables').setAttribute('aria-busy', String(value));
  $('#save-table').textContent = t(value ? 'saving' : 'save');
  $('#login-submit').textContent = t(value ? 'signingIn' : 'signIn');
  document.querySelectorAll('.card-bottom select').forEach((select) => {
    select.disabled = value;
  });
}

const tableIcon =
  '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="8" y="8" width="16" height="16" rx="3"/><path d="M12 4h8M12 28h8M4 12v8M28 12v8" stroke-linecap="round"/></svg>';

function render() {
  $('#total').textContent = tables.length;
  for (const status of statuses)
    $(`#${status}`).textContent = tables.filter((table) => table.status === status).length;
  const query = $('#search').value.trim().toLocaleLowerCase(locale());
  const filtered = tables.filter(
    (table) =>
      displayName(table).toLocaleLowerCase(locale()).includes(query) &&
      ($('#filter').value === 'all' || table.status === $('#filter').value),
  );
  $('#result-count').textContent = t('results', {
    shown: filtered.length,
    total: tables.length,
    source: t(isDemo() ? 'demoData' : 'apiData'),
  });
  $('#tables').replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    const title = document.createElement('h3');
    title.textContent = t(loadError ? 'errorTitle' : tables.length ? 'noMatches' : 'emptyTitle');
    const description = document.createElement('p');
    description.textContent = t(
      loadError ? 'errorHint' : tables.length ? 'searchHint' : 'emptyHint',
    );
    empty.append(title, description);
    $('#tables').append(empty);
  }
  for (const table of filtered) {
    const card = document.createElement('article');
    card.className = 'table-card';
    // Esta plantilla contiene solo valores constantes. Los datos de la API usan textContent.
    card.innerHTML = `<div class="card-top"><span class="table-symbol">${tableIcon}</span><span class="badge"></span></div><div class="card-body"><h3></h3><p></p></div><div class="card-bottom"><label></label><select></select></div>`;
    card.querySelector('.badge').classList.add(table.status);
    card.querySelector('.badge').textContent = t(table.status);
    card.querySelector('h3').textContent = displayName(table);
    card.querySelector('.card-body p').textContent = t('seats', { count: table.capacity });
    const select = card.querySelector('select');
    select.id = `status-${table.id}`;
    card.querySelector('label').htmlFor = select.id;
    card.querySelector('label').textContent = t('changeStatus');
    select.setAttribute('aria-label', t('statusOf', { name: displayName(table) }));
    for (const value of statuses) select.add(new Option(t(value), value));
    select.value = table.status;
    select.disabled = busy;
    select.addEventListener('change', () => changeStatus(table, select.value));
    $('#tables').append(card);
  }
}

const showLoginError = (error = null) => {
  loginError = error;
  $('#login-error').textContent = error ? t(error.key, error.values) : '';
};

// Muestra el login (API sin sesión) o el salón; el botón Salir solo existe con sesión.
function renderAuth() {
  $('#login-panel').hidden = !showingLogin;
  $('#app-view').hidden = showingLogin;
  $('#new-table').hidden = showingLogin;
  $('#logout').hidden = isDemo() || showingLogin || !currentUser;
  $('#user-label').hidden = $('#logout').hidden;
  $('#user-label').textContent = currentUser ? t('signedInAs', { name: currentUser.username }) : '';
}

function showLogin(show) {
  showingLogin = show;
  if (show) {
    currentUser = null;
    showLoginError();
  }
  renderAuth();
  if (show) $('#login-username').focus();
}

async function refreshUser() {
  try {
    currentUser = (await request('/api/auth/me')).user;
  } catch {
    currentUser = null;
  }
  renderAuth();
}

async function load() {
  if (busy) return;
  loadError = '';
  tables = [];
  if (isDemo()) showLogin(false);
  setBusy(true);
  render();
  notice('loading');
  try {
    const result = isDemo() ? structuredClone(demoTables) : await request('/api/tables');
    if (
      !Array.isArray(result) ||
      !result.every(validTable) ||
      new Set(result.map((table) => table.id)).size !== result.length
    ) {
      throw translatedError('invalidList');
    }
    tables = result;
    notice(isDemo() ? 'demoNotice' : 'loaded');
    if (!isDemo()) await refreshUser();
    else renderAuth();
  } catch (error) {
    if (error.key === 'sessionRequired' && !isDemo()) {
      // Sin sesión: se pide login; no se simulan datos ni se vuelve al modo demo.
      showLogin(true);
      notice('');
    } else {
      loadError = error;
      notice(error.key || 'httpError', true, error.values);
    }
  } finally {
    setBusy(false);
    render();
  }
}

async function changeStatus(table, status) {
  if (busy) return;
  setBusy(true);
  try {
    if (isDemo()) {
      demoTables = demoTables.map((item) => (item.id === table.id ? { ...item, status } : item));
      tables = structuredClone(demoTables);
    } else {
      const updated = await request(`/api/tables/${table.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (!validTable(updated) || updated.id !== table.id || updated.status !== status)
        throw translatedError('invalidPatch');
      tables = tables.map((item) => (item.id === updated.id ? updated : item));
    }
    notice('updated', false, { name: displayName(table) });
  } catch (error) {
    if (error.key === 'sessionRequired' && !isDemo()) showLogin(true);
    else notice(error.key || 'httpError', true, error.values);
  } finally {
    setBusy(false);
    render();
  }
}

$('#new-table').addEventListener('click', () => {
  $('#table-form').reset();
  showFormError();
  $('#table-dialog').showModal();
  $('#table-name').focus();
});
for (const selector of ['#close-dialog', '#cancel-dialog'])
  $(selector).addEventListener('click', () => $('#table-dialog').close());
$('#table-dialog').addEventListener('cancel', (event) => {
  if (busy) event.preventDefault();
});
$('#table-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  const name = $('#table-name').value.trim();
  const capacity = Number($('#table-capacity').value);
  showFormError();
  if (!name || name.length > 80 || !Number.isInteger(capacity) || capacity < 1 || capacity > 20) {
    showFormError(translatedError('validation'));
    return;
  }
  setBusy(true);
  try {
    let created;
    if (isDemo()) {
      if (demoTables.some((table) => table.name.toLowerCase() === name.toLowerCase()))
        throw translatedError('duplicate');
      created = {
        id: Math.max(0, ...demoTables.map((table) => table.id)) + 1,
        name,
        capacity,
        status: 'available',
      };
      demoTables.push(created);
    } else {
      created = await request('/api/tables', {
        method: 'POST',
        body: JSON.stringify({ name, capacity }),
      });
      if (!validTable(created) || tables.some((table) => table.id === created.id))
        throw translatedError('invalidPost');
    }
    tables.push(created);
    loadError = '';
    $('#search').value = '';
    $('#filter').value = 'all';
    $('#table-dialog').close();
    notice('created', false, { name });
  } catch (error) {
    if (error.key === 'sessionRequired' && !isDemo()) {
      $('#table-dialog').close();
      showLogin(true);
    } else showFormError(error);
  } finally {
    setBusy(false);
    render();
  }
});
$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  const username = $('#login-username').value.trim();
  const password = $('#login-password').value;
  showLoginError();
  if (!username || !password) {
    showLoginError(translatedError('loginRequired'));
    return;
  }
  setBusy(true);
  let ok = false;
  try {
    await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    $('#login-password').value = '';
    ok = true;
  } catch (error) {
    showLoginError(error.key === 'sessionRequired' ? translatedError('invalidCredentials') : error);
  } finally {
    setBusy(false);
  }
  if (ok) {
    showLogin(false);
    await load();
  }
});
$('#logout').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    notice(error.key || 'httpError', true, error.values);
  } finally {
    setBusy(false);
  }
  tables = [];
  showLogin(true);
  render();
});
$('#source').addEventListener('change', () => {
  try {
    localStorage.setItem('reservet.source', $('#source').value);
  } catch {
    /* Optional preference. */
  }
  $('#mode-description').textContent = t(isDemo() ? 'demoDescription' : 'apiDescription');
  void load();
});
$('#refresh').addEventListener('click', () => void load());
try {
  if (localStorage.getItem('reservet.source') === 'api') $('#source').value = 'api';
} catch {
  /* Storage may be disabled. */
}
$('#search').addEventListener('input', render);
$('#filter').addEventListener('change', render);
void load();

function updateLanguage() {
  applyLanguage($('#language').value);
  $('#mode-description').textContent = t(isDemo() ? 'demoDescription' : 'apiDescription');
  setBusy(busy);
  render();
  if (lastNotice) notice(lastNotice.key, lastNotice.error, lastNotice.values);
  showFormError(formError);
  showLoginError(loginError);
  renderAuth();
}
$('#language').addEventListener('change', updateLanguage);
applyLanguage();
updateLanguage();
