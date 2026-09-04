# D1 migrations

Database schema changes are versioned as SQL files in this directory and must
be applied with Wrangler. Do not run migrations from the Worker request
handler.

## Create a migration

```text
npm run db:migration:create -- add-menus-table
```

Edit the generated SQL file, review it, and commit it to the repository.

## Apply migrations locally

```text
npm run db:migrations:apply:local
```

## Apply migrations remotely

The deploy script applies remote migrations before publishing the Worker:

```text
npm run deploy
```

The remote migration step is also available separately when needed:

```text
npm run db:migrations:apply:remote
```

Review migration SQL before deploying. Use the local database for development
and tests. Never run migrations from the Worker request handler.