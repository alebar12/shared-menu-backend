# Shared Menu Backend

Cloudflare Worker backend for creating shared menu identifiers and storing meals
for each menu. The application runs on Cloudflare Workers and uses a Cloudflare
D1 database for persistence.

## Requirements

- Node.js 22 or newer
- npm
- A Cloudflare account for remote D1 migrations and deployment

## Getting started

Install dependencies:

```text
npm install
```

For local development, create a `.dev.vars` file in the repository root. Do
not commit this file:

```text
SEED=replace-with-a-long-random-secret
```

Apply the D1 schema to the local database and start Wrangler:

```text
npm run db:migrations:apply:local
npm run dev
```

Wrangler prints the local Worker URL, normally `http://localhost:8787`.

## Configuration

The Worker expects these bindings or variables:

| Name | Type | Purpose |
| --- | --- | --- |
| `DB` | D1 database | Stores menu meals. Configured in `wrangler.jsonc`. |
| `REQUEST_RATE_LIMITER` | Rate Limit binding | Allows 100 requests per 60 seconds. |
| `SEED` | Secret | Signs and verifies generated menu IDs. |

## Development commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local Wrangler development server. |
| `npm test` | Run the Vitest test suite. |
| `npm run format` | Format TypeScript source and test files with Prettier. |
| `npm run cf-typegen` | Regenerate Cloudflare Worker type definitions. |
| `npm run db:migrations:list:local` | List local D1 migrations. |
| `npm run db:migrations:apply:local` | Apply pending migrations locally. |
| `npm run db:migration:create -- name` | Create a new migration. |
| `npm run deploy` | Run tests, apply remote migrations, and deploy the Worker. |

Migration details are documented in [`migrations/README.md`](migrations/README.md).
Review SQL migrations before applying them to the remote database.

## Deployment

Configure Cloudflare authentication for Wrangler, set the production `SEED`
secret, then run:

```text
npm run deploy
```

The deploy command runs the test suite, applies pending remote migrations, and
publishes the Worker. The hourly cron schedule is configured in
`wrangler.jsonc`.