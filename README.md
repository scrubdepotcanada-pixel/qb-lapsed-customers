# QBO Lapsed Customer Export

Pulls customer and invoice data from QuickBooks Online, finds customers who haven't purchased in 18+ months whose last order was $500+, and exports to Excel.

Built for Scrub Depot Canada / The Web Guys.

## Setup

### 1. Clone and install
```bash
git clone <repo-url>
cd qb-lapsed-customers
npm install
```

### 2. Configure environment
Copy `.env.local.example` to `.env.local` and fill in:
```
QB_CLIENT_ID=your_client_id
QB_CLIENT_SECRET=your_client_secret
QB_REALM_ID=6247719998715156
QB_REDIRECT_URI=http://localhost:3000/api/qb/callback
```

### 3. Run locally
```bash
npm run dev
```
Visit http://localhost:3000 → Click "Connect to QuickBooks" → Authorize → Export.

## Deploy to Vercel

### 1. Push to GitHub
Create a new repo (e.g. `qb-lapsed-customers`) under `scrubdepotcanada-pixel` org and push.

### 2. Import to Vercel
- Go to vercel.com → New Project → Import from GitHub
- Add these **Environment Variables**:
  - `QB_CLIENT_ID` — from developer.intuit.com
  - `QB_CLIENT_SECRET` — from developer.intuit.com
  - `QB_REALM_ID` — `6247719998715156`
  - `QB_REDIRECT_URI` — `https://your-project.vercel.app/api/qb/callback`

### 3. Update QuickBooks Redirect URI
Go to developer.intuit.com → your app → Keys & OAuth → add your Vercel production URL as a Redirect URI:
`https://your-project.vercel.app/api/qb/callback`

## Usage

| Action | URL |
|--------|-----|
| Dashboard | `/` |
| Start OAuth | `/api/qb/auth` |
| Check connection | `/api/qb/status` |
| Export Excel | `/api/qb/lapsed-customers?months=18&min_amount=500` |
| Preview JSON | `/api/qb/lapsed-customers?months=18&min_amount=500&format=json` |

### Adjustable Filters
- `months` — How many months of inactivity (default: 18)
- `min_amount` — Minimum last order amount (default: 500)
- `format` — `xlsx` (default) or `json`

## How It Works
1. OAuth2 connects to your QBO company
2. Pulls all active customers
3. Pulls all invoices + sales receipts
4. Aggregates by customer: total spent, last order date/amount
5. Filters: last order date > X months ago AND last order >= $Y
6. Exports sorted by total lifetime spend (highest first)

## Token Management
- Access tokens auto-refresh (valid 1 hour, refreshed automatically)
- Refresh tokens valid for 5 years (as of Intuit's Nov 2025 policy)
- Tokens stored in-memory; on Vercel cold start you'll need to re-auth once
- For persistent tokens, swap the in-memory store for a DB/KV (Supabase, Vercel KV, etc.)
