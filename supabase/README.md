# Supabase — PARTEQUIPOS Posventa Inteligente

Scripts SQL para ejecutar **manualmente** en el SQL Editor de Supabase.
La aplicación **no crea** las tablas automáticamente.

## Orden de ejecución SQL

| # | Archivo | Descripción |
|---|---------|-------------|
| 1 | `schema/00_extensions.sql` | Extensiones PostgreSQL |
| 2 | `schema/01_calculadora.sql` | Temparios, matriz frecuencias, cotizaciones |
| 3 | `schema/02_mantenimientos_proyectados.sql` | Telemetría, clientes, asesores, KPIs |
| 4 | `schema/03_cpp.sql` | Catálogo CPP, cotizaciones |
| 5 | `schema/04_shared.sql` | Perfiles, importaciones, auditoría |
| 6 | `schema/05_rls_policies.sql` | Políticas RLS (requiere Auth habilitado) |
| 7 | `schema/06_seed_ejemplo.sql` | Datos de ejemplo (opcional) |
| 8 | `schema/07_auth_trigger.sql` | Trigger perfil al crear usuario Auth |
| 9 | `schema/08_temparios_admin.sql` | Índice legacy_id + SELECT admin (temparios) |
| 10 | `schema/09_seed_admin_user.sql` | Usuario admin@partequipos.com / password123 |
| — | `schema/30_temparios_admin_batch_delete.sql` | Temparios: import_batch_id + DELETE admin por lote |
| — | `schema/31_telemetria_distancia_caucasia_villavicencio.sql` | Telemetría: Distancia Caucasia + Villavicencio |
| 11 | `schema/10_temparios_excel_columns.sql` | Columna tipo_catalogo (derivado de Modelo2) |
| 12 | `schema/11_temparios_upsert_legacy.sql` | UNIQUE legacy_id para upsert masivo |
| 13 | `schema/12_temparios_filter_views.sql` | Vistas DISTINCT marca/modelo/tipo para filtros |
| 14 | `schema/13_temparios_fluido_labor_rate.sql` | CHECK Fluido + default tarifa 110000 COP/h |
| — | `schema/14_temparios_diagnose_tipos.sql` | Diagnóstico opcional: conteo tipos/frecuencias |
| 15 | `schema/15_fix_frequency_matrix_2000.sql` | Matriz horómetro: 2000 h en 2000/4000/6000/8000 |
| 16 | `schema/16_modelo2_tipo_observacion.sql` | CHECK tipo_item incluye Observacion (Modelo2) |
| 17 | `schema/17_truncate_temparios_reimport.sql` | Vaciar temparios antes de reimportar Excel |
| 18 | `schema/18_rename_tipo_item_to_modelo2.sql` | tipo_item = Excel Modelo2 (revierte rename si aplica) |
| 19 | `schema/19_telemetria_normalize_relations.sql` | Sedes + máquinas + FKs + RLS clientes/asesores |
| 20 | `schema/20_admin_module.sql` | Configuración sistema + RLS admin perfiles/auditoría |
| 21 | `schema/21_telemetria_periodo_unique.sql` | Telemetría UNIQUE (serie, mes, año): historial mensual sin duplicar flota |

## Dónde ejecutar `supabase functions deploy`

Los comandos **no** se ejecutan en el SQL Editor. Se ejecutan en la **terminal** (PowerShell / CMD / bash) desde la carpeta del proyecto, con la [CLI de Supabase](https://supabase.com/docs/guides/cli).

### 1. Instalar CLI (una sola vez)

```powershell
npm install -g supabase
```

O con Scoop: `scoop install supabase`

### 2. Iniciar sesión y vincular el proyecto

```powershell
cd "c:\Users\Frank Duran\OneDrive - Partequipos S.A.S\Escritorio\PostventaInteligente\project"

supabase login
supabase link --project-ref obhgdgnozeaneljprudd
```

> **Importante:** no uses el texto literal `TU_PROJECT_REF`. Usa tu Reference ID real  
> (ej. `obhgdgnozeaneljprudd`). Está en Dashboard → Project Settings → General.

### 3. Desplegar las Edge Functions

```powershell
supabase functions deploy import-excel
supabase functions deploy create-admin-user
supabase functions deploy send-maintenance-alerts
```

### 4. Verificar

Dashboard → **Edge Functions** → deben aparecer `import-excel`, `create-admin-user` y `send-maintenance-alerts`.

### Cron de alertas (7 días antes del MTTO)

**Nota:** si el plan de Supabase no muestra **Schedules**, use **Vercel Cron** (recomendado en este proyecto).

#### Opción A — Vercel Cron (sin Schedules de Supabase)

1. En Vercel → Project → Settings → Environment Variables, agregar:
   - `CRON_SECRET` = token largo aleatorio
   - `SUPABASE_SERVICE_ROLE_KEY` = service role (si aún no está)
2. Deploy con `vercel.json` que incluye:
   - path: `/api/cron/send-maintenance-alerts`
   - schedule: `0 13 * * *` (08:00 America/Bogota)
3. Vercel → Project → **Cron Jobs** debe listar esa ruta.
4. Prueba manual (PowerShell):

```powershell
curl -X GET "https://postventa-inteligente.vercel.app/api/cron/send-maintenance-alerts" `
  -H "Authorization: Bearer TU_CRON_SECRET"
```

#### Opción B — Secrets Gmail (siempre en Supabase)

| Secret | Valor |
|--------|--------|
| `GMAIL_USER` | `storageentrenapartequipos@gmail.com` |
| `GMAIL_APP_PASSWORD` | Contraseña de aplicación Gmail |
| `ALERT_FROM_EMAIL` | Mismo correo Gmail |

**Redeploy Edge Function:**

```powershell
supabase functions deploy send-maintenance-alerts
```

**Prueba desde la app:** Administración → Configuración → «Ejecutar alertas ahora».

## Auth

1. Habilitar Email/Password en Authentication → Providers
2. Ejecutar `07_auth_trigger.sql`
3. Crear el administrador de pruebas con **una** de estas opciones:

### Opción A — SQL (recomendada)

Ejecutar en SQL Editor el archivo `schema/09_seed_admin_user.sql`.

Credenciales:

- Email: `admin@partequipos.com`
- Password: `password123`
- Rol en `perfiles`: `administrador`

### Opción B — Dashboard

1. Authentication → Users → **Add user** → Email / Password  
   - Email: `admin@partequipos.com`  
   - Password: `password123`  
   - Marcar **Auto Confirm User**
2. Luego en SQL Editor:

```sql
UPDATE public.perfiles
SET rol = 'administrador',
    nombre = 'Administrador PARTEQUIPOS',
    activo = TRUE,
    updated_at = NOW()
WHERE lower(email) = lower('admin@partequipos.com');
```

Si el perfil aún no existe (sin trigger), créalo con el `id` del usuario en Authentication.

## Variables de entorno (frontend / Vercel)

Local (`.env.local`) y en Vercel → Project → Settings → Environment Variables:

```
NEXT_PUBLIC_APP_URL=https://tu-app.vercel.app
NEXT_PUBLIC_SUPABASE_URL=https://obhgdgnozeaneljprudd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-public-key
```

## Despliegue en Vercel

```powershell
cd "c:\Users\Frank Duran\OneDrive - Partequipos S.A.S\Escritorio\PostventaInteligente\project"
npx vercel login
npx vercel link
npx vercel env pull   # opcional
npx vercel --prod
```

O en [vercel.com/new](https://vercel.com/new): Import Git Repository → `fradurgo19/postventa-inteligente` → add env vars → Deploy.

Tras el deploy, en Supabase → Authentication → URL Configuration:

- Site URL: `https://tu-app.vercel.app`
- Redirect URLs: `https://tu-app.vercel.app/**`

## Importación Excel / CSV

La Edge Function `import-excel` acepta:

- **`.xlsx`** (Excel moderno)
- **`.xls`** (Excel clásico)
- **`.csv`** (UTF-8)

Lee la **primera hoja** del libro. Columnas deben coincidir con la estructura del módulo:

| Módulo | Tabla destino |
|--------|---------------|
| `calculadora` | `temparios_mantenimiento` |
| `proyectados` | `telemetria_equipos` |
| `cpp` | `cpp_catalogo` |
