# IT Facilities RAG Dashboard — Imarat Group

Real-time facility monitoring dashboard for IT teams. Tracks Internet and Biometric status
across all 34 Imarat Group facilities with RAG (Red/Amber/Green) logic.

## Features
- 34 facilities pre-loaded (Projects, Imarat, Graana, Agency21)
- RAG status for Internet + Biometric per facility
- Auto-calculated Overall Status
- Filter by status (All / Red / Amber / Green)
- Summary cards (Total / Operational / Degraded / Critical)
- Issue notes per facility
- Auto-timestamp on status change
- Persisted in localStorage (survives page refresh)
- Export to .xlsx with color-coded cells

## Setup — Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev

# 3. Open in browser
http://localhost:3000
```

## Deploy on Vercel

### Option A — CLI (fastest)
```bash
npm install -g vercel
vercel
# Follow prompts — it auto-detects Next.js
```

### Option B — GitHub
1. Push this folder to a GitHub repo
2. Go to https://vercel.com/new
3. Import the repo
4. Click Deploy (zero config needed)

## File Structure

```
rag-dashboard/
├── app/
│   ├── layout.tsx       # Root layout + fonts
│   ├── page.tsx         # Entry point
│   └── globals.css      # Base styles
├── components/
│   └── Dashboard.tsx    # Full dashboard (all logic here)
├── package.json
├── next.config.js
└── tsconfig.json
```

## Customisation

**Add a facility**: In `Dashboard.tsx`, add to the `FACILITIES` array:
```ts
{ name: "New Branch", cat: "Agency21" },
```

**Change RAG logic**: Edit `calcOverall()` function in `Dashboard.tsx`.

**Change status options**: Edit `INTERNET_OPTS` or `BIO_OPTS` arrays.
