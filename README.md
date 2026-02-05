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
- PostgreSQL 16+

## Setup

```bash
npm install
```

Create a `.env` file for the database connection (and future auth secrets):

```bash
DATABASE_URL=postgres://user:password@localhost:5432/hour_tracker
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
