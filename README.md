# Hour Tracker Monorepo

A monorepo for the Hour Tracker multitenant time-tracking SaaS built with Next.js 14, TypeScript, PostgreSQL 16, Tailwind CSS, and NextAuth.js.

## Workspace Layout

- `apps/web`: Next.js App Router application.
- `packages/database`: PostgreSQL utilities and repositories.
- `packages/types`: Shared TypeScript types.
- `packages/ui`: Shared UI components.

## Prerequisites

- Node.js 20+
- npm 10+
- Docker and Docker Compose

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the example environment file and adjust values if needed:

```bash
cp .env.example .env
```

3. Start PostgreSQL and Redis:

```bash
docker compose up -d
```

To check that the services are healthy:

```bash
docker compose ps
```

To stop the services:

```bash
docker compose down
```

To stop the services **and delete all data**:

```bash
docker compose down -v
```

## Development

```bash
npm run dev
```

## Type Checking

```bash
npm run typecheck
```

## Linting & Formatting

```bash
npm run lint
npm run format
```
