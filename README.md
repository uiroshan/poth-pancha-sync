# Pothpancha Sync

Pothpancha Sync is a monorepo containing multiple event-driven Cloudflare Worker microservices designed to sync data between WooCommerce and other services (Search, Media, AI, WhatsApp).

## 🛠️ Tech Stack

- **Environment**: Cloudflare Workers
- **Language**: TypeScript
- **Package Manager**: pnpm (Workspaces / Monorepo)
- **Validation**: Zod (for schemas)
- **Testing**: Vitest
- **Infrastructure**: Cloudflare Queues (Event-Driven), Cloudflare KV (State Storage)

## 📂 Project Structure

This project is built as a pnpm workspace and is split into two main sections:

### Apps (`apps/`)
Independent Cloudflare Worker microservices:

- **`dispatcher`**: The entry point for external events like WooCommerce Webhooks and cron jobs. It routes events to the appropriate internal queues.
  - **Produces to Queues**: `search-sync-queue` (`SEARCH_SYNC`), `media-sync-queue` (`MEDIA_SYNC`), `order-sync-queue` (`ORDER_SYNC`), `woo-fetch-queue` (`WOO_FETCH_QUEUE`)
  - **Consumes from Queue**: `woo-fetch-queue`
  - **KV Bindings**: `SYNC_STATE`
- **`ai-sync`**: Processing queue for AI-related operations.
  - **Consumes from Queue**: `ai-sync-queue`
- **`media-sync`**: Processing queue for media updates (e.g., uploading images to S3).
  - **Consumes from Queue**: `media-sync-queue`
  - **KV Bindings**: `MEDIA_STATE`
- **`search-sync`**: Processing queue for updating search indexes (Meilisearch).
  - **Consumes from Queue**: `search-sync-queue`
- **`whatsapp-sync`**: Handles WhatsApp messaging integrations.
  - **Consumes from Queue**: `order-sync-queue`
  - **D1 Bindings**: `WHATSAPP_DB`
- **`chat-dashboard`**: Web interface for chat integrations.
  - **D1 Bindings**: `WHATSAPP_DB`

### Packages (`packages/`)
Shared libraries and utilities used across the apps:
- **`shared`**: Contains common types, Zod schemas, data transformations, and shared unit tests.

## 🏗️ Architecture

1. **Event-Driven Processing**: The `dispatcher` app intercepts external events (like WooCommerce webhooks) and immediately pushes them to dedicated Cloudflare Queues (e.g., `search-sync-queue`, `media-sync-queue`, `order-sync-queue`). This allows webhooks to return `200 OK` almost instantly, while heavy processing is delegated to worker apps consuming from the queues.
2. **State Management**: Uses **Cloudflare KV namespaces** (e.g., `SYNC_STATE`) to track asynchronous states, such as cursors (`max_modified_seen` during pagination).
3. **Environment Isolation**: Environments (Production and Staging) are isolated via `wrangler.toml`. Staging utilizes distinct bindings and prefixed queue names (e.g., `staging-search-sync-queue`).

## 🚀 Getting Started

### Prerequisites
- Node.js
- pnpm
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) authenticated with your Cloudflare account (`npx wrangler login`).

### Installation

1. Clone the repository.
2. Install dependencies:
   ```bash
   pnpm install
   ```

### Local Development

To run all worker applications locally, run:
```bash
pnpm dev
```
This command concurrently starts the development servers for all apps inside the `apps/` directory using Wrangler.

### Running Tests

To run Vitest for all shared packages and apps:
```bash
pnpm test
```

## 🌐 Environments & Deployments

The project supports two main environments defined in each worker's `wrangler.toml`:
1. **Production** (default)
2. **Staging** (`--env staging`)

### Deploying to Production

To deploy all worker applications to the production environment, run:
```bash
pnpm deploy
```
This runs the `deploy` script across all applications in the `apps/` directory.

### Deploying to Staging

To deploy a specific application to the staging environment, navigate to the app's directory and run:
```bash
npx wrangler deploy --env staging
```
*Note: Make sure that all Cloudflare Queues and KV Namespaces required by the staging environment are created in your Cloudflare dashboard prior to deployment.*

### Managing Secrets

Secrets (like WooCommerce Webhook Secrets or API keys) should not be hardcoded in `wrangler.toml`. Set them securely using the Wrangler CLI.

For Production:
```bash
npx wrangler secret put WEBHOOK_SECRET
```

For Staging:
```bash
npx wrangler secret put WEBHOOK_SECRET --env staging
```
*(Run these commands within the specific app's directory, e.g., `apps/dispatcher`)*
