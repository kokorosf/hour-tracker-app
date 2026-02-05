# Database Migrations

Plain SQL migration files for the Hour Tracker database. Files are numbered and must be run in order.

## Prerequisites

Make sure PostgreSQL is running (see root README for Docker instructions):

```bash
docker compose up -d
```

## Running Migrations

Connect to the database and execute each file in order:

```bash
# Run all migrations at once
cat packages/database/migrations/0*.sql | docker compose exec -T postgres psql -U hourtracker_user -d hourtracker

# Or run a single migration
docker compose exec -T postgres psql -U hourtracker_user -d hourtracker < packages/database/migrations/001_create_tenants.sql
```

Alternatively, if you have `psql` installed locally:

```bash
psql "postgres://hourtracker_user:dev_password_123@localhost:5432/hourtracker" -f packages/database/migrations/001_create_tenants.sql
```

## Migration Order

1. `001_create_tenants.sql` - Tenants table and pgcrypto extension
2. `002_create_users.sql` - Users table (references tenants)
3. `003_create_clients.sql` - Clients table (references tenants)
4. `004_create_projects.sql` - Projects table (references tenants, clients)
5. `005_create_tasks.sql` - Tasks table (references tenants, projects)
6. `006_create_time_entries.sql` - Time entries table (references tenants, users, projects, tasks)

## Resetting the Database

To drop everything and start fresh:

```bash
docker compose down -v
docker compose up -d
```

Then re-run all migrations.
