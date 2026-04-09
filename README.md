# Custody Law Near Me

A production-ready web application that identifies a user's state and county based on location or ZIP code and explains child custody laws for that jurisdiction.

## Features

- **Location Detection** — Use GPS or enter a ZIP code to identify your jurisdiction
- **Jurisdiction-Specific Laws** — View child custody law summaries for your state
- **AI-Powered Q&A** — Ask specific questions and get plain-English answers
- **5 Key Legal Areas** — Custody standard, types, modification rules, relocation rules, enforcement

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Wouter
- **Backend**: Node.js, Express, TypeScript
- **APIs**: Google Maps Geocoding API, OpenAI API
- **Build**: Vite, esbuild

## Setup

### Prerequisites

- Node.js 18+
- A Google Maps API key (with Geocoding API enabled)
- An OpenAI API key (or use Replit's built-in AI integration)

### Local environment files (one-time)

Create two local-only files in the repo root:

1) `.env.local` (app/server values)

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
OPENAI_API_KEY=your_openai_api_key
```

2) `.env.qa` (Playwright QA values)

```bash
QA_BASE_URL=http://127.0.0.1:5050
QA_USER_EMAIL=returning-user@example.com
QA_USER_PASSWORD=replace-with-password
QA_FRESH_USER_EMAIL=fresh-user@example.com
QA_FRESH_USER_PASSWORD=replace-with-password
QA_FRESH_USER_PREFERRED_NAME=Taylor
QA_CASE_ID=replace-with-existing-case-id
```

> These files are ignored by git. Use real local secrets only on your machine.

### Installation

```bash
npm install
```

### Development (no repeated exports)

```bash
npm run dev:local
```

The server automatically loads `.env.local` at startup.

### Production Build

```bash
npm run build
npm start
```

## Browser QA (Playwright)

Playwright automatically loads `.env.qa`.

```bash
npm run qa:workspace
npm run qa:onboarding
npm run qa:dashboard
npm run qa:all
npm run qa:report
```

Combined local flow (start local app → wait → run workspace QA):

```bash
npm run qa:workspace:local
```

See `qa/README.md` for detailed QA guidance.
