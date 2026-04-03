# Hour Tracker — Product Requirements Document

**Generated:** 2026-03-28
**Codebase path:** `C:\Users\Kokoro Horiuchi\hour-tracker-app`
**Status:** Living document — reflects codebase as of the generation date above

---

## Table of Contents

1. [Overview](#1-overview)
2. [Repository Architecture](#2-repository-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Database Schema](#4-database-schema)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Multi-Tenancy](#6-multi-tenancy)
7. [Core Features](#7-core-features)
8. [API Design](#8-api-design)
9. [MCP Endpoint](#9-mcp-endpoint)
10. [Telegram Bot Integration](#10-telegram-bot-integration)
11. [AI Integration (Anthropic Claude)](#11-ai-integration-anthropic-claude)
12. [Reports & Exports](#12-reports--exports)
13. [Email Integration (SendGrid)](#13-email-integration-sendgrid)
14. [Frontend Architecture](#14-frontend-architecture)
15. [Infrastructure & Deployment](#15-infrastructure--deployment)
16. [Security Patterns](#16-security-patterns)
17. [Third-Party Integrations Summary](#17-third-party-integrations-summary)
18. [Environment Variables](#18-environment-variables)
19. [Key Learnings & Reusable Patterns](#19-key-learnings--reusable-patterns)

---

## 1. Overview

Hour Tracker is a multi-tenant SaaS time-tracking application. Organisations (tenants) sign up, invite team members, and track time against a hierarchy of Clients → Projects → Tasks. Administrators can export reports as PDF or CSV, email them automatically, and interact with the system through a Telegram bot that has an embedded Claude AI agent for natural-language queries and time logging.

The app also exposes a machine-callable **MCP endpoint** (`POST /api/mcp`) so that external AI agents and tools (e.g. Claude Code / Claude Desktop) can query and log time programmatically using a Bearer JWT.

---

## 2. Repository Architecture

The repository is an **npm workspaces monorepo** with the following top-level layout:

```
hour-tracker-app/
├── apps/
│   └── web/                   # Next.js 14 application (App Router)
├── packages/
│   ├── database/              # @hour-tracker/database — pg repositories + migrations
│   ├── types/                 # @hour-tracker/types — shared TypeScript interfaces/DTOs
│   └── ui/                    # @hour-tracker/ui — shared React component stubs
├── terraform/                 # GCP infrastructure-as-code
├── deploy.sh                  # Manual deploy script (build → push → migrate → deploy)
├── docker-compose.yml         # Local development compose
├── package.json               # Root workspace config
└── tsconfig.base.json         # Shared TypeScript base config
```

### Package dependency graph

```
apps/web
  └── depends on @hour-tracker/database
  └── depends on @hour-tracker/types
  └── depends on @hour-tracker/ui

packages/database
  └── depends on @hour-tracker/types
```

### `packages/database`

- Raw `pg` (node-postgres) driver — **no ORM**.
- `src/connection.ts` — singleton `Pool`, `query()` helper with built-in tenant scoping, `transaction()` helper.
- `src/repositories/` — one repository class per entity (Base, Client, Project, Task, TimeEntry, User, ChatIdentity, ProcessedMessage).
- `migrations/` — 13 numbered `.sql` files run in sequence by `deploy.sh`.

### `packages/types`

- Shared TypeScript interfaces mirroring the DB schema (`Tenant`, `User`, `Client`, `Project`, `Task`, `TimeEntry`).
- Auth types: `ExtendedUser`, `ExtendedSession`.
- All Create/Update DTOs.

### `packages/ui`

- Shared React peer-dep package (currently a stub; actual components live in `apps/web/components/`).

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, `"type": "module"`) |
| Runtime | Node.js 18 (Alpine Docker image) |
| Language | TypeScript 5.5 throughout |
| Database | PostgreSQL 16 (raw `pg` driver, pool max 20) |
| Session cache | Redis 7 (used by rate limiter in production; rate limiter is currently in-memory) |
| Auth | NextAuth v5 (beta) — Credentials provider, JWT strategy |
| Password hashing | bcryptjs (10 salt rounds) |
| UI library | Tailwind CSS 3, Headless UI 2, Lucide React icons |
| Charts | Recharts 3 |
| Calendar | FullCalendar 6 (dayGrid + timeGrid + interaction plugins) |
| Data fetching | SWR 2 |
| Forms | React Hook Form 7 |
| PDF generation | jsPDF 4 + jspdf-autotable 5 |
| CSV generation | PapaParse 5 |
| Email | SendGrid (`@sendgrid/mail`) |
| AI / LLM | Anthropic Claude (`@anthropic-ai/sdk`, model: `claude-sonnet-4-20250514`) |
| Telegram | Telegram Bot API (webhook mode, plain HTTP) |
| Testing | Jest 30, Testing Library |
| Linting | ESLint 8, Prettier 3 (tailwindcss plugin) |
| Container | Docker (multi-stage, standalone Next.js output) |
| IaC | Terraform (Google provider ~5.0) |
| Hosting | Google Cloud Run (managed, serverless) |
| DB host | GCE `e2-micro` VM running PostgreSQL + Redis in Docker |
| Container registry | Google Container Registry (gcr.io) |
| Scheduler | Google Cloud Scheduler |
| Object storage | Google Cloud Storage (backups, 90-day lifecycle) |

---

## 4. Database Schema

All tables live in a single PostgreSQL database (`hourtracker`). UUIDs are generated with `gen_random_uuid()` from the `pgcrypto` extension. All entities except `audit_log` and token tables use `deleted_at` for soft-deletes.

### Entity Relationship Overview

```
tenants (1)
  ├── users (N)           tenant_id → tenants.id
  ├── clients (N)         tenant_id → tenants.id
  │   └── projects (N)    client_id → clients.id, tenant_id → tenants.id
  │       └── tasks (N)   project_id → projects.id, tenant_id → tenants.id
  ├── time_entries (N)    tenant_id + user_id + project_id + task_id
  ├── invite_tokens (N)   user_id → users.id
  ├── password_reset_tokens (N) user_id → users.id
  ├── audit_log (N)       tenant_id + user_id (nullable)
  ├── chat_identity_mappings (N) user_id → users.id
  └── processed_messages (N) tenant_id nullable
```

### Table Definitions

#### `tenants`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | gen_random_uuid() |
| `name` | VARCHAR(255) | Organisation display name |
| `plan` | VARCHAR(50) | Default `'free'` |
| `accountant_email` | VARCHAR(255) | Optional; recipient of monthly cron reports |
| `telegram_chat_id` | TEXT | Optional; links a Telegram group to this tenant |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

#### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK → tenants | |
| `email` | VARCHAR(255) | Unique per tenant |
| `password_hash` | VARCHAR(255) | bcryptjs, never returned to client |
| `role` | VARCHAR(20) | CHECK: `'admin'` or `'user'` |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

Index: `idx_users_tenant_id`

#### `clients`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK | |
| `name` | VARCHAR(255) | |
| `deleted_at` | TIMESTAMP | Soft-delete; NULL = active |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

Index: `idx_clients_tenant_deleted (tenant_id, deleted_at)`

#### `projects`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK | |
| `client_id` | UUID FK → clients | |
| `name` | VARCHAR(255) | |
| `is_billable` | BOOLEAN | Default `true` |
| `deleted_at` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

Indexes: `idx_projects_tenant_deleted`, `idx_projects_client_id`

#### `tasks`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK | |
| `project_id` | UUID FK → projects | |
| `name` | VARCHAR(255) | |
| `deleted_at` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

Indexes: `idx_tasks_tenant_deleted`, `idx_tasks_project_id`

#### `time_entries`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK | |
| `user_id` | UUID FK → users | |
| `project_id` | UUID FK → projects | |
| `task_id` | UUID FK → tasks | |
| `start_time` | TIMESTAMP | |
| `end_time` | TIMESTAMP | CHECK: end > start |
| `duration` | INTEGER | Minutes (auto-calculated from start/end) |
| `description` | TEXT | Optional free-text note |
| `deleted_at` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

Indexes: `idx_time_entries_tenant_user_start`, `idx_time_entries_tenant_project`, `idx_time_entries_tenant_deleted`

#### `invite_tokens`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK CASCADE | |
| `tenant_id` | UUID FK | |
| `token` | TEXT UNIQUE | UUID-based random token |
| `expires_at` | TIMESTAMP | 7 days from creation |
| `used_at` | TIMESTAMP | NULL = unused; set on acceptance |
| `created_at` | TIMESTAMP | |

Partial index on `token WHERE used_at IS NULL` for fast lookup.

#### `password_reset_tokens`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK CASCADE | |
| `token` | TEXT UNIQUE | |
| `expires_at` | TIMESTAMP | 1 hour from creation |
| `used_at` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |

#### `audit_log`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK | |
| `user_id` | UUID FK (nullable, SET NULL on delete) | |
| `action` | VARCHAR(20) | `'create'`, `'update'`, `'delete'` |
| `entity_type` | VARCHAR(50) | `'time_entry'`, `'client'`, etc. |
| `entity_id` | UUID | |
| `before_data` | JSONB | Previous row snapshot |
| `after_data` | JSONB | New row snapshot |
| `created_at` | TIMESTAMP | |

Indexes: by `(tenant_id, entity_type, entity_id)` and `(tenant_id, created_at DESC)`.

#### `chat_identity_mappings`
Links Telegram sender IDs to app users for the bot.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `channel` | TEXT | Default `'telegram'`; extensible |
| `sender_id` | TEXT | Telegram user ID |
| `user_id` | UUID FK CASCADE | |
| `tenant_id` | UUID FK CASCADE | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

Unique: `(channel, sender_id)`

#### `processed_messages`
Idempotency table to prevent double-processing Telegram retries.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `channel` | TEXT | Default `'telegram'` |
| `message_id` | TEXT | Telegram `update_id` |
| `tenant_id` | UUID FK (nullable, SET NULL) | |
| `processed_at` | TIMESTAMPTZ | |

Unique: `(channel, message_id)`. Cleanup index on `processed_at` for TTL sweeps (7 days intended).

---

## 5. Authentication & Authorization

### Session Strategy

- **NextAuth v5** with a **Credentials provider** (email + password).
- Session strategy: **JWT** (no server-side sessions).
- JWT payload includes: `userId`, `email`, `tenantId`, `role`.
- JWT secret stored in `AUTH_SECRET` env var.
- Custom JWT/session callbacks embed `tenantId` and `role` directly into the token so downstream middleware can authorise without DB round-trips.

### Registration Flow

`POST /api/auth/register`
1. Validates email format and password strength (`^(?=.*[A-Z])(?=.*\d).{8,}$`).
2. Checks for global email uniqueness across all tenants.
3. Hashes password with bcryptjs (10 rounds).
4. Creates `tenant` + `user` (role: `admin`) atomically in a DB transaction.
5. Issues a JWT and returns it along with the user object.
   - The first registrant of any tenant becomes its admin.

### Login Flow

`POST /api/auth/login` (NextAuth Credentials)
1. Calls `UserRepository.findByEmailGlobal()` — searches all tenants.
2. Verifies bcrypt hash.
3. Returns JWT containing `{ userId, email, tenantId, role }`.

### Invitation Flow

1. Admin calls `POST /api/users` → creates a new user with a random temp password and an `invite_token` (7-day expiry).
2. SendGrid email is sent with `GET /invite/[token]` link.
3. Invitee visits the link, sets their password via `POST /api/auth/accept-invite` which updates the password hash and marks the token as used.

### Password Reset Flow

1. User submits email via `POST /api/auth/request-reset`.
2. A `password_reset_token` (1-hour expiry) is created and emailed via SendGrid.
3. User visits `/reset-password/[token]` and submits new password via `POST /api/auth/reset-password`.

### API Route Protection

All API routes (except auth endpoints, health, telegram webhook, and cron) are protected by `requireAuth()` from `src/lib/auth/middleware.ts`:

1. Extracts `Authorization: Bearer <jwt>` header.
2. Decodes with `next-auth/jwt decode`, verifying signature and required fields.
3. Attaches `req.user: ExtendedUser` to the request.
4. Applies **rate limiting** (100 req/min per IP, in-memory sliding window).

### Role-Based Access

Two roles: `'admin'` and `'user'`.

`requireRole('admin')` wraps `requireAuth` and adds a role check returning HTTP 403 if the user is not an admin.

**Admin-only routes:**
- `GET/POST /api/users`
- `PUT/DELETE /api/users/[id]`
- `POST /api/reports/email`
- `GET/PUT /api/tenants/settings`

**All authenticated users:**
- CRUD on their own time entries (regular users cannot see other users' entries in GET).
- Read-only access to clients, projects, tasks for their tenant.
- Admins additionally see all users' time entries and can filter by `userId`.

---

## 6. Multi-Tenancy

Every database table except `processed_messages` (which is channel-global) contains a `tenant_id` column. Tenant isolation is enforced at multiple layers:

1. **JWT**: The token embeds `tenantId`. Every authenticated request carries the tenant context without a DB lookup.
2. **`requireAuth` middleware**: Extracts `tenantId` from the JWT via `getTenantId(req)` — there is no way to supply a different tenant ID from the client.
3. **`query()` helper** in `packages/database/src/connection.ts`: When `tenantId` is passed to the helper it automatically appends `AND tenant_id = $N` (or `WHERE tenant_id = $N`) to every SQL statement. This is the universal "tenant filter" across all repository methods.
4. **Repository pattern**: All `findById`, `findByTenant`, etc. methods require a `tenantId` parameter and pass it to `query()`.
5. **Foreign-key checks**: Before creating time entries the API verifies that `project_id` and `task_id` belong to the same `tenantId`, preventing cross-tenant data association.

Tenant registration creates a new row in `tenants` and the first user (admin) in a single DB transaction. There is no super-admin or global admin role.

---

## 7. Core Features

### 7.1 Time Tracking

- Users log time entries specifying project, task, start time, end time, and an optional description.
- **Duration** is auto-calculated from `end - start` in minutes and stored redundantly for fast aggregation queries.
- **Overlap prevention**: before inserting, the API queries `findOverlapping()` to ensure no existing entry for the same user spans the same time window.
- **24-hour daily cap**: the sum of all entries for a given user/day cannot exceed 1440 minutes.
- **Soft-delete**: entries are not physically deleted; `deleted_at` is set and all queries filter `WHERE deleted_at IS NULL`.
- **Bulk create**: `POST /api/time-entries/bulk` accepts up to 100 entries in a single request, validates each individually, checks both DB overlaps and intra-batch overlaps, then inserts all in a single DB transaction.
- **Audit log**: creates and updates to time entries are written asynchronously to `audit_log` (fire-and-forget).

### 7.2 Calendar View

- Full interactive calendar powered by **FullCalendar 6** with day, week, and month views.
- Time entries appear as colour-coded events (colour derived deterministically from `projectId` via `getProjectColor()`).
- **Drag-and-drop** reschedules entries (with optimistic SWR cache update + rollback on error).
- **Resize** changes entry duration (same optimistic pattern).
- Click on empty slot → create modal pre-filled with the selected time.
- Click on existing event → edit modal.

### 7.3 Client Management

- CRUD for clients scoped to the tenant.
- Soft-delete: archived clients are hidden from the UI but data is preserved.
- Clients are the top-level billing entity in the hierarchy.

### 7.4 Project Management

- Projects belong to exactly one client.
- `is_billable` flag (default `true`) drives the billable/non-billable split in reports.
- Soft-delete.

### 7.5 Task Management

- Tasks belong to exactly one project.
- Used as the leaf-level categorisation of time entries.
- Soft-delete.

### 7.6 User Management (Admin)

- Admins list, invite, update role, and delete users within their tenant.
- Invitations are sent via email using a time-limited token.
- Users can update their own password via `PUT /api/users/me/password`.
- Profile management at `GET/PUT /api/users/me`.

### 7.7 Dashboard

- Date range presets: This Week, Last Week, This Month, Last Month, Custom.
- Summary KPI cards: Total Hours, Billable Hours, Active Projects, Pending Entries (entries without descriptions).
- Charts (Recharts):
  - **Donut chart**: Billable vs Non-billable hours.
  - **Horizontal bar chart**: Top 10 projects by hours.
  - **Horizontal bar chart**: Hours by client (top 10).
  - **Line chart**: Hours per day over the selected range.
- Admin users also receive a **user breakdown** showing hours per team member.

### 7.8 Reports

| Format | Endpoint | Description |
|---|---|---|
| Summary JSON | `GET /api/reports/summary` | Aggregated stats for the dashboard |
| PDF | `POST /api/reports/pdf` | jsPDF landscape A4 with summary boxes + autoTable |
| CSV | `POST /api/reports/csv` | PapaParse with header row + totals row |
| Email | `POST /api/reports/email` | PDF attachment sent to all tenant admins via SendGrid |

All report endpoints support filters: `startDate`, `endDate`, `projectId`, `userId` (admins only for `userId`).

### 7.9 Settings (Tenant Admin)

`GET/PUT /api/tenants/settings` manages:
- `accountantEmail`: recipient of the monthly automated PDF report from the cron job.
- `telegramChatId`: links a Telegram group chat to the tenant for the bot integration.

### 7.10 Automated Cron: Monthly Accountant Report

`POST /api/cron/accountant-report` is triggered by **Google Cloud Scheduler** on the 1st of every month at 06:00 UTC.

- Protected by `Authorization: Bearer <CRON_SECRET>` header.
- Iterates every tenant that has `accountant_email` set.
- Fetches all time entries for the previous calendar month.
- Generates a PDF with `generateReportPdf()`.
- Sends it via SendGrid.
- Returns a per-tenant `sent | skipped | error` status array.

---

## 8. API Design

### Conventions

- All routes live under `apps/web/src/app/api/`.
- Response envelope: `{ success: true, data: <payload> }` on success; `{ success: false, error: "<message>" }` on failure.
- Pagination uses `{ page, pageSize, total, totalPages }`.
- All mutations are guarded by `requireAuth` (JWT Bearer) and CSRF validation (Origin/Referer header check in Next.js middleware).
- `requestId` (nanoid-derived) is attached to 500-level error logs for traceability.

### Route Map

#### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Create tenant + admin user |
| POST | `/api/auth/login` | Public | NextAuth credentials sign-in |
| POST | `/api/auth/request-reset` | Public | Trigger password reset email |
| POST | `/api/auth/reset-password` | Public | Consume reset token |
| POST | `/api/auth/accept-invite` | Public | Consume invite token, set password |
| `*` | `/api/auth/[...nextauth]` | NextAuth | Session / CSRF endpoints |

#### Users
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/users` | Admin | List tenant users (paginated) |
| POST | `/api/users` | Admin | Invite new user |
| GET | `/api/users/me` | User | Current user profile |
| PUT | `/api/users/me` | User | Update own profile |
| PUT | `/api/users/me/password` | User | Change own password |
| GET | `/api/users/[id]` | Admin | Get user by ID |
| PUT | `/api/users/[id]` | Admin | Update user |
| DELETE | `/api/users/[id]` | Admin | Delete user |

#### Clients
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/clients` | User | List active clients |
| POST | `/api/clients` | Admin | Create client |
| GET | `/api/clients/[id]` | User | Get client |
| PUT | `/api/clients/[id]` | Admin | Update client |
| DELETE | `/api/clients/[id]` | Admin | Soft-delete client |

#### Projects
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/projects` | User | List active projects (optionally filter by `clientId`) |
| POST | `/api/projects` | Admin | Create project |
| GET | `/api/projects/[id]` | User | Get project |
| PUT | `/api/projects/[id]` | Admin | Update project |
| DELETE | `/api/projects/[id]` | Admin | Soft-delete project |

#### Tasks
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/tasks` | User | List tasks (filter by `projectId`) |
| POST | `/api/tasks` | Admin | Create task |
| GET | `/api/tasks/[id]` | User | Get task |
| PUT | `/api/tasks/[id]` | Admin | Update task |
| DELETE | `/api/tasks/[id]` | Admin | Soft-delete task |

#### Time Entries
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/time-entries` | User | List entries (paginated, filtered) |
| POST | `/api/time-entries` | User | Create entry |
| POST | `/api/time-entries/bulk` | User | Create up to 100 entries in a transaction |
| GET | `/api/time-entries/[id]` | User | Get entry |
| PUT | `/api/time-entries/[id]` | User | Update entry |
| DELETE | `/api/time-entries/[id]` | User | Soft-delete entry |

#### Reports
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/reports/summary` | User | Dashboard aggregations |
| POST | `/api/reports/pdf` | User | Download PDF |
| POST | `/api/reports/csv` | User | Download CSV |
| POST | `/api/reports/email` | Admin | Send PDF via email to admins |

#### Tenant Settings
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/tenants/settings` | Admin | Read accountant email + Telegram chat ID |
| PUT | `/api/tenants/settings` | Admin | Update accountant email + Telegram chat ID |

#### Special Endpoints
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | Public | Liveness probe; `?check=db` for DB ping |
| POST | `/api/mcp` | Bearer JWT | Machine-callable protocol (see Section 9) |
| POST | `/api/telegram/webhook` | Bot token implicit | Receive Telegram updates |
| POST | `/api/telegram/setup` | Public/Admin | Register webhook URL with Telegram |
| POST | `/api/cron/accountant-report` | CRON_SECRET | Monthly accountant report |

---

## 9. MCP Endpoint

`POST /api/mcp` implements a simplified **Model Context Protocol** (MCP) — a single POST endpoint that dispatches to named methods. It is designed to be called by AI agents (Claude Desktop, Claude Code) using the same JWT that a human user would obtain by logging in.

**Authentication:** Standard `Authorization: Bearer <jwt>` (same as all other API routes).

**Request shape:**
```json
{
  "method": "<method_name>",
  "params": { ... }
}
```

**Supported methods:**

| Method | Description | Key Params |
|---|---|---|
| `query_clients` | List all active clients for the tenant | — |
| `query_projects` | List projects; optionally filter by `clientId` | `clientId?` |
| `query_tasks` | List tasks for a project | `projectId` (required) |
| `log_time_entry` | Create a time entry for today | `projectId`, `taskId`, `duration` (human string or minutes), `description?` |
| `get_user_status` | Current week hours + last 5 entries for the caller | — |
| `get_time_entries` | Paginated entry list | `startDate?`, `endDate?`, `projectId?`, `limit?`, `offset?` |
| `update_time_entry` | Partial update of an entry the caller owns | `entryId`, any of `projectId`, `taskId`, `description`, `startTime`, `endTime` |
| `delete_time_entry` | Soft-delete an entry the caller owns | `entryId` |

**Duration parsing** (`log_time_entry`):
- `"2h"` → 120 min
- `"30m"` → 30 min
- `"1h30m"` → 90 min
- `"1.5h"` → 90 min
- `"90"` (plain number) → 90 min

For `log_time_entry`, the entry is placed at 09:00 today with end = 09:00 + duration. Overlap detection is applied before creation.

The MCP endpoint is **CSRF-exempt** (listed in `middleware.ts`) because AI agents are non-browser clients.

---

## 10. Telegram Bot Integration

The Telegram integration is a full **conversational bot** with structured commands and a Claude AI fallback for natural language.

### Architecture Pipeline

```
POST /api/telegram/webhook
  → Rate limiting (30 req/min per sender, 120 req/min per tenant)
  → Idempotency check (processed_messages table)
  → handleTelegramMessage()
      → resolveChatContext()    — maps chatId → tenant, senderId → user
      → parseIntent()           — structured command parser
          → if structured: executeX()  — direct DB operations
          → if natural_language: handleWithClaude()  — Claude agentic loop
      → sendMessage() / sendChatAction()
```

### Structured Commands

| Command | Description |
|---|---|
| `/start` | Returns the chat's Telegram ID for initial setup |
| `/help` | Lists available commands |
| `/link <email>` | Links the sender's Telegram user to their Hour Tracker account by email |
| `/hours today` | Shows today's total hours for the linked user |
| `/hours week` | Shows this week's total hours |
| `/log <duration> [client:X] [project:X] [task:X] [note:X]` | Log a time entry with fuzzy name matching |
| `/recent` | Shows last 5 time entries |
| `/status` | Shows this week's summary |

### `/log` Command Detail

The `/log` command supports fuzzy matching of client, project, and task names. If a name is ambiguous (multiple matches), the bot initiates a **disambiguation session** stored in `session-store.ts` (in-memory). The user replies with a number to resolve the ambiguity and the original command is re-executed with the resolved ID.

### Natural Language Mode (Claude)

Any message that does not match a structured command pattern is passed to the **Claude agentic loop** (`handleWithClaude()`):

- Model: `claude-sonnet-4-20250514`, max_tokens: 1024, up to 10 tool-call rounds.
- System prompt includes: tenant name, today's date, whether the user is linked, time-range interpretation rules.
- Tools available to Claude:

| Tool | Description |
|---|---|
| `get_user_hours` | Hours for a user in a date range (by email, partial match) |
| `get_project_hours` | Hours grouped by project |
| `list_users` | All employees in the org |
| `list_projects` | All active projects |
| `get_summary` | High-level org summary |
| `log_time` | Log a time entry for the linked user (partial name resolution, overlap + daily cap checks) |

### Tenant Linking

- A tenant admin configures `telegram_chat_id` in Settings (the chat ID is displayed when `/start` is sent to an unlinked chat).
- Individual users link their Telegram identity by sending `/link their@email.com` — this creates a row in `chat_identity_mappings`.

### Webhook Security

The webhook endpoint (`POST /api/telegram/webhook`) is public (no JWT), but:
1. Messages are only processed if the `telegram_chat_id` matches a registered tenant.
2. Rate limiting is applied per sender and per chat.
3. The `processed_messages` table prevents replay attacks from Telegram retries.

---

## 11. AI Integration (Anthropic Claude)

Claude is used in two places:

### 11.1 Telegram natural-language handler

See Section 10. The Anthropic SDK is invoked from `src/lib/telegram/handler.ts` using the `ANTHROPIC_API_KEY` environment variable. The agentic loop makes synchronous tool calls against the PostgreSQL database (no separate service layer — tools call the repository classes directly).

### 11.2 MCP endpoint (for external agents)

The MCP endpoint at `POST /api/mcp` enables Claude Code, Claude Desktop, and other AI agents to interact with Hour Tracker using any standard JWT. This is not Anthropic SDK code — it is a REST endpoint that speaks a simplified JSON-RPC-like protocol. The AI agent calls this endpoint directly.

---

## 12. Reports & Exports

### PDF Reports

Generated server-side using **jsPDF** + **jspdf-autotable**:
- A4 landscape orientation.
- Header: company name, report title, date range, generation date.
- Four summary stat boxes: Total Hours, Total Entries, Projects, Users.
- Auto-table with columns: Date, User, Client, Project, Task, Start, End, Hours (decimal), Description.
- Alternating row colours (slate-50), blue-500 header.
- Footer on every page: page number + company name.
- Totals row after the table.
- Descriptions truncated to 60 characters.

Two code paths generate PDFs with the same visual output:
1. `POST /api/reports/pdf` — inline download (browser).
2. `src/lib/reports/pdf-generator.ts` — used by the email/cron endpoints (returns a `Buffer`).

### CSV Reports

Generated using **PapaParse** with headers and a TOTAL row appended. Columns match the PDF. Quoted fields.

### Email Reports

`POST /api/reports/email` (admin-triggered) and `/api/cron/accountant-report` (cron) both:
1. Generate a PDF `Buffer` via `generateReportPdf()`.
2. Call `sendReport()` from `src/lib/email/service.ts` which sends via `@sendgrid/mail` with the PDF as a base64-encoded attachment (`application/pdf`, `disposition: attachment`).

---

## 13. Email Integration (SendGrid)

`src/lib/email/service.ts` provides three functions:

| Function | Template | Trigger |
|---|---|---|
| `sendInvitation()` | `invitation.html` | `POST /api/users` (admin invites user) |
| `sendPasswordReset()` | `password-reset.html` | `POST /api/auth/request-reset` |
| `sendReport()` | `report.html` | `POST /api/reports/email` and cron |

Templates are HTML files in `src/lib/email/templates/` loaded from disk and cached in a `Map`. Interpolation uses `{{variableName}}` syntax.

Sender: `FROM_EMAIL` env var, defaults to `noreply@hourtracker.app`.
API key: `SENDGRID_API_KEY` env var. If not set, the module silently skips configuration (no crash, but sends will fail).

---

## 14. Frontend Architecture

### Pages (App Router)

```
/                           → root page (redirects to /login or /dashboard)
/(auth)/login               → sign-in form
/(auth)/register            → register new org
/(auth)/forgot-password     → request password reset
/(auth)/reset-password/[token] → set new password
/invite/[token]             → accept invitation, set password

/dashboard                  → KPI dashboard (charts + date picker)
/dashboard/calendar         → FullCalendar interactive time view
/dashboard/clients          → client list + CRUD modal
/dashboard/projects         → project list + CRUD modal
/dashboard/tasks            → task list + CRUD modal
/dashboard/users            → user list + invite modal (admin only)
/dashboard/reports          → report filters + PDF/CSV download + email send
/dashboard/settings         → tenant settings (accountant email, Telegram chat ID)
/dashboard/manage           → (route exists; content not examined)
```

The `/dashboard` layout is a **Server Component** that:
1. Calls `getServerSession()` (NextAuth server-side auth).
2. Redirects to `/login` if unauthenticated.
3. Fetches the tenant name from the DB.
4. Renders `<DashboardShell>` passing `email`, `role`, `tenantName`.

### Key Client Components

| Component | Location | Purpose |
|---|---|---|
| `DashboardShell` | `components/dashboard/shell.tsx` | Outer layout wrapper |
| `Sidebar` | `components/dashboard/sidebar.tsx` | Navigation rail |
| `TopBar` | `components/dashboard/topbar.tsx` | Header with tenant name and user info |
| `TimerBar` | `components/dashboard/timer-bar.tsx` | Persistent timer/entry creation bar |
| `TimeEntryModal` (dashboard) | `components/dashboard/time-entry-modal.tsx` | Create/edit form |
| `ClientModal` | `components/dashboard/client-modal.tsx` | Client CRUD |
| `TimeEntryModal` (calendar) | `components/calendar/time-entry-modal.tsx` | Calendar-specific entry modal |
| `Button`, `Input`, `Modal`, `Toast` | `components/ui/` | Shared primitives |

### State Management

- **No global state library** (no Redux/Zustand).
- Server state managed by **SWR 2** (`useSWR` on the dashboard page, calendar page, and list pages).
- SWR key is constructed from query parameters; mutations call `mutate()` for revalidation.
- Optimistic updates are used in the calendar for drag-and-drop and resize operations with `rollbackOnError: true`.
- Local UI state (modals, form state) uses `useState` + `useCallback`.
- Forms use **React Hook Form 7**.

### API Client

`src/lib/api/client.ts` exposes a singleton `api` instance of `ApiClient`:
- Reads JWT from `localStorage('token')`.
- Adds `Authorization: Bearer <token>` header automatically.
- 30-second timeout with `AbortController`.
- **3 retries with exponential backoff** (500ms, 1s, 1.5s) on 5xx errors.
- Unwraps `{ success, data }` envelope; throws `ApiRequestError` on `success: false`.

### Styling

- **Tailwind CSS 3** with PostCSS.
- Custom colour palette not defined — uses Tailwind defaults (blue-600, slate-400, violet-500, amber-500, emerald-500 appear in dashboard charts).
- `prettier-plugin-tailwindcss` enforces class ordering.

---

## 15. Infrastructure & Deployment

### GCP Architecture

```
Internet
  └── Google Cloud Run (hour-tracker-web)
        ├── Port 3000, 0–3 instances (scales to zero)
        ├── 1 vCPU, 512Mi RAM per instance
        ├── Startup probe: GET /api/health (5s delay, 10s period, 3 failures)
        ├── VPC Connector → private subnet 10.0.0.0/24
        └── Env vars: DATABASE_URL, AUTH_SECRET, REDIS_URL, SENDGRID_API_KEY,
                      CRON_SECRET, TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, NODE_ENV

GCE e2-micro VM (hour-tracker-db) — private subnet
  ├── PostgreSQL 16 (Docker: port 5432, pd-ssd 20GB, named volume pg-data)
  └── Redis 7 (Docker: port 6379)

Firewall: TCP 5432 + 6379 allowed from 10.0.0.0/24 and 10.8.0.0/28 (connector) only
SSH: port 22 open (tagged: database)

Google Cloud Scheduler
  ├── Weekly: POST /api/reports/weekly — Mondays 09:00 ET (not yet implemented in code)
  └── Monthly: POST /api/cron/accountant-report — 1st of month 06:00 UTC

Google Cloud Storage
  └── ${project_id}-hour-tracker-backups (versioned, 90-day lifecycle delete)

Terraform state: GCS bucket hour-tracker-tf-state
```

### Docker Build

Multi-stage `Dockerfile` in `apps/web/`:
1. **deps** stage: `node:18-alpine`, installs all workspace dependencies via `npm ci`.
2. **builder** stage: copies everything, runs `npm run build --workspace apps/web` (Next.js standalone output).
3. **runner** stage: minimal image, copies `.next/standalone`, static files, and migration SQL files. Runs as non-root `nextjs` user. `CMD ["node", "apps/web/server.js"]`.

### `deploy.sh`

Bash script wrapping the full deployment pipeline:
1. Builds and pushes Docker image to `gcr.io/${GCP_PROJECT_ID}/hour-tracker-web:${IMAGE_TAG}`.
2. Runs all SQL migration files in order via `psql` (errors from already-applied migrations are warned, not fatal).
3. Deploys to Cloud Run via `gcloud run deploy`.

Flags: `--skip-build` (just migrate + deploy), `--migrate-only`.

### Terraform Variables

| Variable | Purpose |
|---|---|
| `project_id` | GCP project ID |
| `region` | Default `us-central1` |
| `zone` | Default `us-central1-a` |
| `db_password` | PostgreSQL password (sensitive) |
| `auth_secret` | NextAuth JWT secret (sensitive) |
| `sendgrid_api_key` | Email delivery (optional) |
| `docker_image` | Full `gcr.io/…` image URL |
| `cron_secret` | Bearer token for cron endpoints (optional) |
| `telegram_bot_token` | Telegram Bot API token (optional) |
| `anthropic_api_key` | AI features (optional) |

---

## 16. Security Patterns

| Pattern | Implementation |
|---|---|
| **CSRF protection** | Next.js middleware validates `Origin`/`Referer` header against the app host for all state-changing API requests. Exempt: NextAuth routes, `/api/cron/`, `/api/telegram/`, `/api/mcp`. |
| **JWT auth** | `Authorization: Bearer <jwt>`, decoded with `next-auth/jwt decode` + `AUTH_SECRET` |
| **Rate limiting** | In-memory sliding window: 100 req/60s per IP on all authenticated routes. Telegram: 30 msg/60s per sender, 120 msg/60s per tenant chat. Applies to auth endpoints via separate limiters. |
| **Tenant isolation** | `tenantId` from JWT; `query()` helper auto-appends `AND tenant_id = $N`. No client-supplied tenant IDs trusted. |
| **Password policy** | Min 8 chars, at least 1 uppercase, 1 digit (`^(?=.*[A-Z])(?=.*\d).{8,}$`). |
| **Password storage** | bcryptjs, 10 rounds. |
| **Invite/reset tokens** | UUID-based, single-use, time-limited (invite: 7 days, reset: 1 hour). Partial index on `WHERE used_at IS NULL` for O(1) lookups. |
| **Cron endpoint auth** | `Authorization: Bearer <CRON_SECRET>` checked inline; not JWT. |
| **Telegram idempotency** | `processed_messages` table with `UNIQUE(channel, message_id)` prevents double-processing on Telegram retries. |
| **Audit log** | All creates, updates, and deletes to time entries are recorded with before/after JSONB snapshots. |
| **Non-root container** | Docker runner stage creates and uses `nextjs` user (UID 1001). |
| **Cloud Run IAM** | `roles/run.invoker` granted to `allUsers` (public web app). |
| **Network isolation** | Cloud Run → VPC connector → private subnet. Firewall restricts DB ports (5432, 6379) to connector CIDR only. |
| **requestId tracing** | 500-level errors generate a `requestId` logged server-side, returned in the error response for support correlation. |

---

## 17. Third-Party Integrations Summary

| Integration | Purpose | Config |
|---|---|---|
| **Anthropic Claude API** | Telegram natural-language handler (agentic loop), external MCP callers | `ANTHROPIC_API_KEY` |
| **Telegram Bot API** | Webhook-based bot; `/start`, `/log`, `/hours`, `/recent`, `/status`, `/link`, `/help` | `TELEGRAM_BOT_TOKEN` |
| **SendGrid** | Transactional email: invitations, password resets, report delivery | `SENDGRID_API_KEY`, `FROM_EMAIL` |
| **Google Cloud Run** | Application hosting (serverless containers) | GCP project config |
| **Google Cloud Scheduler** | Cron triggers for weekly/monthly reports | GCP project config |
| **Google Cloud Storage** | Database backup bucket | Terraform-provisioned |
| **Google Container Registry** | Docker image storage | `gcr.io/${project_id}/...` |
| **Google VPC / Compute Engine** | Private network + DB VM | Terraform-provisioned |

---

## 18. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (`postgres://user:pass@host:5432/db`) |
| `AUTH_SECRET` | Yes | NextAuth JWT signing secret |
| `REDIS_URL` | Prod | Redis URL for rate limiter (future; currently in-memory) |
| `SENDGRID_API_KEY` | Optional | SendGrid for email; features degrade gracefully if absent |
| `FROM_EMAIL` | Optional | Sender email; defaults to `noreply@hourtracker.app` |
| `CRON_SECRET` | Optional | Bearer token for `/api/cron/*` endpoints |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram integration; bot features disabled if absent |
| `ANTHROPIC_API_KEY` | Optional | Claude AI; Telegram NL mode disabled if absent |
| `AUTH_URL` / `NEXTAUTH_URL` | Optional | Base URL for invite links; defaults to `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | Optional | Override for the API client base URL |
| `NODE_ENV` | Prod | Set to `production` in Docker |

---

## 19. Key Learnings & Reusable Patterns

Lessons from building this app that apply to future projects.

---

### Architecture

**Monorepo with shared packages pays off early.** Splitting `database`, `types`, and `ui` into separate packages forced clean boundaries from day one. The `types` package in particular eliminated an entire class of bugs — the API and client never disagreed on a DTO shape because they imported from the same source.

**Raw SQL + repository pattern beats an ORM for small teams.** No ORM magic means migrations are plain `.sql` files you can read and reason about. The `query()` helper with built-in tenant scoping was 50 lines of code and covered 95% of security concerns at the data layer. The trade-off: no automatic schema-to-type generation (types had to be written by hand in `packages/types`).

**Embed tenantId in the JWT and never trust it from the client.** Pulling `tenantId` from the token at the middleware layer means there is exactly one place where tenant identity is established. Every repository method receives it as a parameter — it cannot be spoofed by the caller.

---

### Authentication

**NextAuth v5 Credentials + custom JWT callbacks is the right setup for non-OAuth apps.** The default NextAuth session includes very little. Adding `tenantId`, `role`, and `userId` to the JWT callbacks means downstream API routes never touch the database for auth context — they decode the token and have everything they need.

**Dual token storage (localStorage + HTTP-only cookie) is messy.** The app ended up storing the JWT in `localStorage` for the API client while NextAuth also maintains its own cookie session for server components. This is redundant and creates the MCP token copy-from-browser problem. For a future app: pick one — either JWT in localStorage (simpler for API-heavy SPAs) or NextAuth's session cookie (better for SSR-heavy apps with middleware auth). Don't do both.

**Single-use tokens for invites and resets need a partial index.** `WHERE used_at IS NULL` on `invite_tokens` and `password_reset_tokens` is what makes token lookup O(1) even as the table grows. Always add this index — lookup on a growing table of all-time tokens without it becomes a table scan.

---

### Multi-tenancy

**Enforce tenant scoping at the query helper, not in every repository method.** The `query(sql, params, tenantId)` helper that appends `AND tenant_id = $N` automatically is safer than remembering to add it in each repository. It's a forcing function — you have to explicitly opt out, not in.

**Always verify FK ownership before creating cross-entity records.** Before creating a time entry, the app checks that `project_id` and `task_id` belong to the same tenant. Without this check, a determined user could associate their entries with another tenant's data by guessing UUIDs. Add FK ownership checks whenever an entity references another entity that belongs to a tenant.

---

### API Design

**A consistent `{ success, data, error }` envelope makes client code boring (in a good way).** The `ApiClient` class unwraps this in one place. Every page component just uses the `data`. No ad-hoc response shape handling anywhere in the UI.

**Retry with exponential backoff belongs in the API client, not in components.** The 3-retry / 500ms-1s-1.5s pattern on 5xx errors in `ApiClient` silently recovers from Cloud Run cold starts. Components never saw a cold-start error. Build this into the client once.

**Separate `requestId` for 500 errors is worth the five lines of code.** When a Cloud Run instance logs an error, the `requestId` in the response lets you find the exact log entry. Without it, correlating a user complaint to a server log is guesswork.

**CSRF exemptions need to be explicit and maintained.** The `middleware.ts` CSRF list (`/api/cron/`, `/api/telegram/`, `/api/mcp`) grew organically. Future apps should document why each route is exempt, not just that it is.

---

### AI Integration

**Design a single MCP endpoint before building natural language features.** The `POST /api/mcp` endpoint with named methods is simpler to secure, version, and test than trying to make general-purpose API routes AI-callable. Because every method goes through the same auth and tenant middleware, there's no special-casing for the AI path.

**The Telegram agentic loop (Claude + tools → DB) is powerful but needs guardrails.** Giving Claude direct tool access to the database means it can answer any natural-language query. The key guardrails here: tool schemas must be specific (not just "run a query"), the system prompt must include today's date and tenant context, and the loop needs a hard cap on rounds (10 here) to prevent runaway API spend.

**Structured commands + Claude fallback is the right Telegram architecture.** Structured commands (`/log`, `/hours`, `/status`) are fast, cheap, and predictable. Claude fallback handles everything else. Don't try to route everything through the LLM — it's slower, more expensive, and harder to test.

**Idempotency is non-negotiable for webhook handlers.** Telegram re-sends messages on timeout. The `processed_messages` table with `UNIQUE(channel, message_id)` prevents double-logging time entries, double-responses, etc. Any future webhook integration (Slack, GitHub, Stripe) needs the same pattern.

---

### Frontend

**SWR + optimistic updates is the right model for a calendar.** FullCalendar's drag/resize callbacks fire before the server confirms. The pattern — update SWR cache immediately, call the API, roll back on error — gives an instant-feeling UI with correct eventual state. The key is using `mutate(key, optimisticData, { rollbackOnError: true })`.

**FullCalendar 6 needs careful integration with React.** The library manages its own DOM. The safe pattern: all state lives in SWR, FullCalendar receives events as props derived from SWR data, and mutations go through the API → SWR revalidation path. Never let FullCalendar be the source of truth for event state.

**No global state library for a CRUD app is the right call.** Redux or Zustand would be over-engineering for this scope. SWR handles server state; `useState` handles local UI state. The complexity budget was spent on real features instead.

---

### Infrastructure

**Cloud Run + GCE VM for DB is a practical setup for low-traffic apps.** Cloud Run scales to zero (cost-efficient), GCE `e2-micro` runs PostgreSQL + Redis for ~$6/month. The VPC connector keeps DB traffic private. This architecture can handle thousands of users before needing to upgrade.

**Terraform for infrastructure, `deploy.sh` for application deploys.** Terraform manages the GCP resources (VM, Cloud Run service, scheduler, firewall rules). `deploy.sh` handles the application lifecycle (build → migrate → deploy). Mixing the two responsibilities leads to pain — keep them separate.

**SQL migrations as plain numbered `.sql` files is sufficient.** No migration framework needed. The `deploy.sh` script runs them in order. Files are idempotent where possible (e.g., `CREATE INDEX IF NOT EXISTS`). For small teams and single-database apps, this is all you need.

**Soft-delete everything user-facing.** Setting `deleted_at` instead of `DELETE` means accidental deletes are recoverable, the audit log stays coherent, and foreign key constraints are never violated by cascades. The cost is filtering `WHERE deleted_at IS NULL` in every query — the `query()` helper's tenant scoping could extend to handle this automatically in a future iteration.

---

### Reports & Exports

**Generate PDFs server-side with jsPDF, not a headless browser.** Puppeteer/Playwright for PDF generation requires a large runtime, is slow on cold starts, and is hard to run in serverless environments. jsPDF + jspdf-autotable produces decent tabular reports in milliseconds with no browser dependency. Trade-off: pixel-perfect HTML-to-PDF fidelity is impossible.

**Separate the PDF generation function from the API route handler.** `generateReportPdf()` is a pure function that takes data and returns a `Buffer`. Both the browser download route and the email/cron route call it. This was the right call — any future export target (Slack, S3, etc.) can call the same function.

---

*End of PRD*
