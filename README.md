# City Legend

Jewelry and accessories storefront with an admin CMS: catalog with price and
material filters, product gallery, orders, legal pages. Live at
[citylegend.art](https://citylegend.art). Runs on Next.js 16 App Router with a
PostgreSQL database and roughly 100 API routes; `/auctions` 308-redirects to
`/collection`.

## Tech Stack

- **Next.js 16** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **pg** (node-postgres) - SQL queries live in `lib/db.ts`, no ORM
- **PostgreSQL** - Database

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy `.env.example` to `.env` and configure your PostgreSQL database URL:

```bash
cp .env.example .env
```

Update variables in `.env`:
```
DATABASE_URL="postgresql://user:password@localhost:5432/dbname?schema=public"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
NEXT_PUBLIC_CONTACT_EMAIL="contact@example.com"
```

### 3. Set up the database

Tables are created on first connection by `ensureDatabase()` in `lib/db.ts`, so a
reachable `DATABASE_URL` is enough. Optional seeders:

```bash
npm run seed:documents       # legal and offer documents
npm run db:seed-legal        # legal page content
npm run db:sync-homepage-about   # homepage "about" blocks
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run seed:documents` - Seed legal and offer documents
- `npm run db:seed-legal` - Seed legal page content
- `npm run db:sync-homepage-about` - Sync homepage "about" blocks
- `npm run telegram-relay:deploy` - Deploy the Telegram notification relay
- `npm run telegram-relay:bootstrap` - Bootstrap Telegram chat bindings

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
