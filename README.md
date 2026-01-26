# MyGroceries

A modern grocery shopping list web application inspired by OurGroceries with pricing fetching for Australian grocery stores.

## Features

- **Multiple Shopping Lists**: Create and manage multiple shopping lists
- **Categorized Items**: Organize groceries by categories with custom ordering
- **Price Tracking**: Track prices from Woolworths, Coles, and Aldi with automatic refresh
- **Smart Price Refresh**: 6-day cooldown to prevent scraping detection
- **Crossed Off Items**: Mark items as complete and view them in a separate section
- **Notes**: Add notes to grocery items
- **Quantity Management**: Track quantities with Less/More buttons
- **Product Links**: Add multiple product links per store for price comparison
- **Offline-First**: Full offline support with automatic sync when online
- **PWA**: Progressive Web App capabilities with service worker caching

## Offline-First Architecture

The app implements a comprehensive offline-first strategy for seamless use without connectivity:

- **Local Storage**: IndexedDB (via Dexie) stores shopping lists, items, categories, and product links
- **Mutation Queue**: Actions performed offline are queued and automatically synced when back online
- **Optimistic UI**: Instant feedback for all user actions, even when offline
- **Cache-First Reads**: Data loads instantly from cache, updates in background
- **Service Worker**: Stale-while-revalidate caching strategy for optimal performance
- **Sync Status**: Visual badge shows offline/syncing/pending states
- **Auto-Sync**: Syncs on reconnection, tab visibility, and every 30 seconds

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: SQLite with Prisma ORM
- **Offline Storage**: IndexedDB with Dexie
- **Styling**: Tailwind CSS with Shadcn UI components
- **PWA**: Service Worker with cache-first strategies
- **Testing**: Jest + React Testing Library

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd groceries
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and configure your database:
```
DATABASE_URL="file:./dev.db"
```

**Important**: Never commit `.env` or `*.db` files to version control. These contain sensitive data and should remain local only.

4. Set up the database:
```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Or run migrations
npm run db:migrate
```

5. Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Price Fetching

The app includes price fetching functionality for Woolworths, Coles, and Aldi. Prices are only fetched after Wednesday and cached to reduce calls to store pages.

**Note**: Price fetching selectors may need adjustment based on the actual HTML structure of the store websites. Update the selectors in `lib/price-scraper.ts` as needed.

## Deployment

1. Install environment, with Node.JS and dependencies:
```bash
npm install
```

2. Configure `.env` with `DATABASE_URL`.

3. Build the application:
```bash
npm run build
```
4. Start the production server:
```bash
npm start
```

Or use a process manager like PM2:
```bash
pm2 start npm --name "groceries" -- start
```

## Development

- **Database Studio**: `npm run db:studio` - Open Prisma Studio to view/edit data
- **Linting**: `npm run lint` - Run ESLint
- **Type Checking**: TypeScript is checked during build

## License

MIT
