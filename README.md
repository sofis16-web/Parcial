# Reservet · Solución de la prueba técnica

Aplicación para el personal de un restaurante: **login, gestión de mesas y persistencia en PostgreSQL**
(Express 5 + TypeScript + PostgreSQL, interfaz en español/inglés/ruso).
El enunciado original está en [docs/ENUNCIADO.md](docs/ENUNCIADO.md).

## 1. Requisitos y puesta en marcha (sin Docker)

Git, Node.js **22.13+** y PostgreSQL **17** (probado también con 16). Como administrador de PostgreSQL,
ejecuta **por separado** (con autocommit):

```sql
CREATE ROLE reservet_candidate LOGIN PASSWORD 'local_candidate_password';
CREATE DATABASE reservet_candidate OWNER reservet_candidate;
CREATE DATABASE reservet_candidate_test OWNER reservet_candidate;
```

```bash
npm ci
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
```

Edita `.env` para tu instalación (ver variables abajo; el ejemplo trae 5433 de Docker, una instalación
directa suele usar 5432). Después:

```bash
npm run db:migrate          # crea tablas (mesas, usuarios, sesiones)
npm run db:seed             # crea/actualiza el usuario de prueba
npm run dev                 # http://localhost:3000
```

En la interfaz elige la fuente **Mi API local** e inicia sesión con `SEED_USERNAME` / `SEED_PASSWORD` de tu `.env`
(por defecto del ejemplo: `demo` / `demo-local-password`, **solo para uso local**). Cada comando es repetible.

### Variables de entorno

| Variable            | Uso                                                                        |
| ------------------- | -------------------------------------------------------------------------- |
| `PORT`              | Puerto HTTP (3000).                                                        |
| `DATABASE_URL`      | Conexión a la base de trabajo.                                             |
| `SESSION_TTL_HOURS` | Vida de la sesión, 1-720 (8 por defecto).                                  |
| `SEED_USERNAME`     | Usuario de prueba para `db:seed`. `SEED_PASSWORD`: mínimo 8 caracteres.    |
| `TEST_DATABASE_URL` | Base **exclusiva** de pruebas; su nombre debe terminar en `_test`.         |
| `APP_ENV`, `HOST`   | `dev`/`pro` y dirección de escucha. Con `APP_ENV=pro` la cookie es Secure. |

## 2. Pruebas y verificaciones

```bash
npm run check   # lint + formato + tipos + pruebas + compilación
npm test        # solo pruebas
```

- `tests/api.integration.test.js`: **PostgreSQL real**, nada simulado. Usa `TEST_DATABASE_URL`, aplica las
  migraciones solas, **vacía** `restaurant_tables` y `sessions` entre pruebas y se niega a correr si la base no
  termina en `_test`. Sin `TEST_DATABASE_URL` esas pruebas se omiten con un aviso (en CI siempre se ejecutan).
- `tests/auth-password.test.js`, `tests/config.test.js`: unitarias, sin base.
- `tests/http.test.js`, `tests/ui.test.js`, `tests/ui-regression.test.js`: HTTP con base simulada y JSDOM (el
  navegador y `fetch` están simulados; el backend de negocio no se prueba ahí).
- CI (`.github/workflows/ci.yml`) levanta un PostgreSQL 17 temporal y ejecuta `npm run check`.

## 3. Flujo y decisiones

**Login → petición autenticada → servicio → PostgreSQL**

1. `POST /api/auth/login` valida el cuerpo, busca el usuario y compara la contraseña con **scrypt**
   (`node:crypto`, sal por usuario, parámetros dentro del hash, `timingSafeEqual`). Usuario inexistente y
   contraseña errónea dan el mismo **401** y gastan el mismo tiempo (hash simulado).
2. Si es correcto se crea un token aleatorio de 256 bits. En PostgreSQL (`sessions`) solo se guarda su
   **SHA-256**; el navegador recibe la cookie `reservet_session` (**HttpOnly, SameSite=Strict, Path=/**,
   `Secure` con `APP_ENV=pro`).
3. `requireAuth` (middleware del servidor) busca la sesión no caducada; sin ella responde **401**. Protege todo
   `/api/tables`; `/health*` siguen públicos.
4. `tables.routes` (HTTP) → `tables.service` (validación y reglas) → `tables.repository` (SQL parametrizado).

**Sesión en servidor en vez de JWT.** Se puede revocar al instante: `POST /api/auth/logout` borra la fila y el
token deja de servir aunque alguien lo haya copiado. Caduca a las `SESSION_TTL_HOURS` (8); las caducadas se
rechazan en cada consulta y se purgan al iniciar sesión. Mismo origen y SameSite=Strict frenan CSRF; no se usa
CORS.

**Mesas.** `GET/POST /api/tables`, `PATCH /api/tables/:id/status` con 200/201, 400 (datos), 401, 404 y 409
(nombre duplicado). El nombre se recorta y es único **sin distinguir mayúsculas** (migración `003`, índice
`lower(btrim(name))`). Los `id` se validan (solo dígitos, ≤ 2147483647) para que un valor enorme no cause un 500.
Los errores no incluyen SQL, contraseñas ni stacks, solo `code`, `message` y `requestId`.

**Interfaz.** Con **Mi API local** y sin sesión (401) aparece el login; no se cae al modo demo ni se ocultan
errores del backend. Hay botón **Salir**, la fuente elegida se recuerda al recargar y los textos del servidor se
insertan con `textContent`.

## 4. Uso de IA

Herramienta: **Claude (Anthropic)**, para leer el código inicial, diseñar e implementar el backend, la
interfaz y las pruebas, y redactar esta documentación. Todo se ejecutó contra un PostgreSQL real, y
`npm run check` pasa. _El autor de la entrega debe revisar y poder explicar cada parte._

- **Sugerencia corregida:** mi primera prueba de UI para el caso 401 fallaba. No era un fallo del código: ESM
  cachea los módulos, así que `app.js` no volvía a ejecutarse sobre el DOM nuevo, y además hacía clic en
  «Actualizar» mientras la primera carga seguía ocupada. Lo comprobé aislando la prueba y lo resolví importando
  `app.js` con una query única y esperando a que termine la carga inicial.
- **Contraste con evidencia:** para saber si las pruebas de regresión valen, reintroduje cada defecto y
  confirmé que fallan (capacidad `>= 20`, búsqueda sin minúsculas, clave de idioma incorrecta).

## 5. Registro de problemas del código inicial

Ver [docs/PROBLEMAS.md](docs/PROBLEMAS.md) (síntoma, reproducción, causa, corrección y prueba).

## 6. Pendientes y limitaciones

- No hay límite de intentos de login (fuerza bruta); en producción conviene añadir _rate limiting_.
- Sin registro de usuarios, roles ni recuperación de contraseña (fuera de alcance).
- Los tokens caducados se limpian al iniciar sesión, no con un proceso programado.
- Los archivos de deployment/Docker del repositorio original no se tocaron ni forman parte de esta entrega.
