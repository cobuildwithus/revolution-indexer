# Revolution Indexer

Ponder-based indexer for Revolution contracts on Base mainnet. It ingests onchain
AuctionHouse, TokenSale, CultureIndex, and RevolutionDao events into Postgres and
exposes SQL + GraphQL APIs for downstream apps.

## Requirements

- Node.js >= 18.14
- pnpm >= 9
- Postgres (this project configures `database.kind = "postgres"` in Ponder)
- A Dwellir API key for Base mainnet (`DWELLIR_API_KEY`)
- Optional: an Alchemy API key for Base RPC fallback + NFT metadata names (`ALCHEMY_API_KEY_BASE`)

## Setup

1) Install dependencies:

```sh
pnpm install
```

2) Create an `.env.local` with required environment variables:

```sh
DWELLIR_API_KEY=your_dwellir_key
# Optional: used as RPC fallback and for AuctionHouse NFT metadata name lookups.
ALCHEMY_API_KEY_BASE=your_alchemy_key
DATABASE_URL="postgresql://user:password@host:5432/dbname"
# Optional: override the default Postgres schema name for local/dev runs.
DATABASE_SCHEMA=revolution
```

3) Start the indexer in dev mode:

```sh
pnpm dev
```

Ponder prints the local API URL in the terminal. Use that for GraphQL or SQL.

## Useful Commands

- `pnpm dev`: Run the indexer with file watching + hot reload.
- `pnpm start`: Run the indexer in production mode.
- `pnpm db`: Open the Ponder SQL console/DB UI.
- `pnpm codegen`: Regenerate Ponder types (updates `ponder-env.d.ts`).
- `pnpm lint`: Run ESLint.
- `pnpm typecheck`: Run TypeScript type checking.

## Production Schema Rollouts

Ponder production deployments should index into a fresh deployment schema and
publish stable views after the backfill is ready. Do not point a changed build at
an already-populated stable schema unless you are also running an explicit
expand/backfill/contract database migration.

Example:

```sh
pnpm start --schema=<deployment_schema> --views-schema=revolution
```

The typed sale columns on `auctions` include a non-null `saleType`; a fresh
schema or full replay is safe because every auction insert path writes it. An
in-place table change against existing rows must backfill `sale_type` before
enforcing `NOT NULL`.

## Project Layout

- `ponder.config.ts`: Chain + contract configuration.
- `ponder.schema.ts`: Database schema (tables and indexes).
- `src/index.ts`: Registers all indexing handlers.
- `src/api/index.ts`: Hono API wiring for SQL + GraphQL.
- `src/auction-house/*`: AuctionHouse event handlers.
- `src/token-sale/*`: TokenSale event handlers for VRGDA buy-now purchases.
- `src/culture-index/*`: CultureIndex event handlers.
- `src/revolution-dao/*`: RevolutionDao event handlers.
- `src/config/contracts.ts`: Contract addresses + start blocks.

## Data Model (High-Level)

Tables are defined in `ponder.schema.ts` and mirror legacy Prisma models to keep
migrations predictable. Primary keys are stable, deterministic IDs derived from
chain + contract + onchain identifiers.

### Auctions
- **Table**: `auctions`
- **Primary key**: `id` (same as `uniqueId`)
- **Unique ID**: `chainId + tokenId + tokenContract + saleContract`
- **Purpose**: One row per primary NFT sale. AuctionHouse rows use
  `saleType = "auction"`; TokenSale VRGDA buy-now rows use
  `saleType = "vrgda"`. The row stores recipient/winner, paid price,
  creator/entropy rates, timing details, settlement or purchase tx hash, and
  typed buy-now fields such as `pieceId`, `submissionSlug`, `buyer`,
  `recipient`, and `referral`.

### Auction bids
- **Table**: `auctionBids`
- **Primary key**: `id` (same as `uniqueId`)
- **Unique ID**: `auctionUniqueId + txHash + logIndex`
- **Purpose**: One row per bid. Links back to auctions via `auctionUniqueId`.

### Submissions (CultureIndex pieces)
- **Table**: `submissions`
- **Primary key**: `id` (same as `slug`)
- **Slug**: `chainId:contractAddress:pieceId`
- **Purpose**: One row per CultureIndex piece. Includes IPFS metadata, media
  metadata, creator splits, and status flags (dropped/hidden/onchain).

### Upvotes (CultureIndex votes)
- **Table**: `upvotes`
- **Primary key**: `id` (same as `uniqueId`)
- **Unique ID**: `slug + voter`
- **Purpose**: One row per voter per piece, with vote weight snapshots.

### Proposals (Revolution DAO)
- **Table**: `proposals`
- **Primary key**: `id` (same as `uniqueId`)
- **Unique ID**: `entityId + proposalId`
- **Purpose**: One row per DAO proposal, including execution data, payout
  amounts, and status transitions.

### Votes (Revolution DAO)
- **Table**: `votes`
- **Primary key**: `id` (same as `uniqueId`)
- **Unique ID**: `entityId + voter + proposalId`
- **Purpose**: One row per DAO vote, with option selection and vote weight.

## How the Indexer Works

### 1) Chain & contracts
`ponder.config.ts` connects to Base mainnet using Dwellir and optionally falls
back to Alchemy when `ALCHEMY_API_KEY_BASE` is configured. It registers four
contracts (AuctionHouse, TokenSale, CultureIndex, RevolutionDao) using addresses
from `src/config/contracts.ts`. Legacy contracts index from `VRBS_START_BLOCK`;
TokenSale indexes from `TOKEN_SALE_START_BLOCK`.

### 2) Event handlers
Handlers live in `src/**` and are wired by `src/index.ts`.

**AuctionHouse** (`src/auction-house/*`)
- `AuctionCreated` inserts/upserts auctions with initial settings and timing.
- `AuctionBid` inserts/upserts auction bid records.
- `AuctionSettled` updates winners, payouts, and settlement tx hash.
- `AuctionExtended` updates the auction end time.
- Settings updates (time buffer, reserve price, min bid increment, creator
  rate, entropy rate) update only *active* auctions.
- `ManifestoUpdated` stores the acceptance speech.

**TokenSale** (`src/token-sale/*`)
- `TokenPurchased` inserts/upserts VRGDA buy-now rows into `auctions` with
  `saleType = "vrgda"`.
- `auctionContractAddress` stores the TokenSale proxy address for these rows.
- `ManifestoUpdated` stores the acceptance speech for TokenSale purchases.

**CultureIndex** (`src/culture-index/*`)
- `PieceCreated` inserts/upserts submissions, normalizes IPFS media URLs, and
  stores creator splits.
- `VoteCast` updates the submission’s `votesWeight` and upserts an `upvote`.
- `PieceDropped` marks a submission as dropped.

**RevolutionDao** (`src/revolution-dao/*`)
- `ProposalCreatedWithRequirements` creates a proposal row with execution data
  and initial status.
- Status events (queued/executed/canceled/vetoed) update `proposals.status` with
  ordering guards.
- `VoteCast` inserts/upserts votes, increments proposal totals, and ensures
  votes are only counted once per event position.

### 3) API surface
`src/api/index.ts` exposes:
- **GraphQL** at `/` and `/graphql`
- **SQL** at `/sql/*`

Use these endpoints to query the indexed Postgres data once the indexer is
running.
