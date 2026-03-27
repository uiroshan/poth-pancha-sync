# Project Documentation (pothpancha-sync)

This is a central hub for documenting the tech stack, coding standards, and architectural rules for the **pothpancha-sync** repository.

## 🛠️ Tech Stack
- **Environment**: Cloudflare Workers
- **Language**: TypeScript
- **Package Manager**: pnpm (Workspaces / Monorepo)
- **Validation**: Zod (for schemas)
- **Testing**: Vitest (`vitest run` & `vitest` in root)
- **Infrastructure**: Cloudflare Queues (Event-Driven), Cloudflare KV (State Storage)

## 📂 Project Structure
The project is built as a monorepo utilizing `pnpm-workspace.yaml`. It is split into two main sections:
- **`apps/`**: Contains multiple independent Cloudflare Worker microservices.
  - `dispatcher`: Entry point for WooCommerce Webhooks and cron jobs. Routes events to appropriate queues.
  - `ai-sync`: Processing queue for AI-related operations.
  - `media-sync`: Processing queue for media updates (e.g., uploading images to S3).
  - `search-sync`: Processing queue for updating search indexes.
  - `whatsapp-sync`: Handles WhatsApp messaging integrations.
- **`packages/`**: Shared libraries and utilities.
  - `shared`: Contains common types, Zod schemas, data transformations (e.g., `transformWooCommerceBook`), and shared unit tests.

## 📏 Coding Standards
1. **TypeScript by Default**: All `.ts` files should maintain strict types. Even without an explicit root `tsconfig.json`, types and definitions provided by `@cloudflare/workers-types` should be strictly adhered to.
2. **Linting & Formatting**: 
   - Currently, there are no explicit root-level ESLint or Prettier setups, meaning default IDE formatting rules and Wrangler esbuild's compilation apply. 
   - Ensure you use standard clean TypeScript syntax and follow native `wrangler` ecosystem best practices.
3. **Shared Business Logic**: Do not duplicate data models or transformation logic across `apps/*`. Put them in `packages/shared/` and keep it perfectly covered by Vitest tests (e.g., `book.test.ts`).

## 🏗️ Architectural Rules

1. **Event-Driven Architecture (Cloudflare Queues)**:
   - Synchronous processing within webhooks should be kept to a bare minimum.
   - The `dispatcher` app intercepts external events (like WooCommerce Webhooks and Cron triggers) and immediately dumps them into dedicated Queues (`search-sync-queue`, `media-sync-queue`, `order-sync-queue`).
   - Use `queue` handlers in respective worker apps to consume messages safely without affecting webhook response times.
2. **State Management**:
   - Use **Cloudflare KV namespaces** (e.g., `SYNC_STATE`) to track asynchronous states such as cursors (`max_modified_seen` during pagination). Do not rely on in-memory persistence across worker invocations.
3. **Graceful Failures**:
   - Webhook processing (in `dispatcher`) should aggressively return `200 OK` wrapped in `catch` blocks to prevent third-party integrations (WooCommerce) from automatically disabling the webhook.
4. **Environment Isolation**:
   - Each app explicitly defines its environments (like `[env.staging]`) in its `wrangler.toml` to prevent cross-contamination. Ensure you point bindings, queues, and variables precisely to appropriate staging prefixes.
