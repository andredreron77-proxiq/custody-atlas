# Custody Atlas — replit.md

## Overview

**Custody Atlas** is a production-ready web application that helps users understand child custody laws specific to their jurisdiction (US state and county). Users can:

1. Share their location via GPS or ZIP code
2. View a structured summary of custody laws for their state (covering 6 key areas: custody standard, custody types, modification rules, relocation rules, enforcement options, and mediation requirements)
3. Ask an AI assistant plain-English questions about custody law in their jurisdiction

The app is a single-page React frontend backed by a Node.js/Express API server. Legal data is stored in a static JSON file (`data/custody_laws.json`) using snake_case fields, abstracted via `server/custody-laws-store.ts` for future DB migration. Location resolution uses Google Maps Geocoding API. The AI Q&A feature uses OpenAI's chat completions API.

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Frontend (React + TypeScript)

- **Framework**: React 18 with TypeScript, built via Vite
- **Routing**: Wouter (lightweight client-side router)
- **State/Data Fetching**: TanStack Query (React Query v5) for server state; local React state for UI state
- **UI Components**: shadcn/ui (Radix UI primitives + Tailwind CSS)
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Key Pages**:
  - `/` — Landing page with feature overview, map preview, and state coverage
  - `/workspace` — **Case Workspace** dashboard: central hub with 6 cards (jurisdiction, quick actions, recent docs, recent questions, custody map, privacy)
  - `/location` — Location selection page (GPS or ZIP code)
  - `/jurisdiction/:state/:county` — Displays state custody law summary (6 sections) with collapsible cards
  - `/ask` — AI Q&A chat interface, jurisdiction-aware
  - `/upload-document` — Document OCR analysis with AI follow-up Q&A
  - `/custody-map` — Interactive U.S. map with explore mode (per-state panel) and compare mode (side-by-side table)
  - `/privacy`, `/terms` — Legal pages
- **Component Structure**:
  - `client/src/pages/` — Top-level page components
  - `client/src/components/app/` — Domain-specific components:
    - `LocationSelector` — GPS + ZIP state machine (idle/loading/success/error states)
    - `ChatBox` — Structured AI Q&A card with key points and attorney questions
    - `JurisdictionHeader` — Location summary with state code badge and coordinates
    - `JurisdictionContextHeader` — Compact persistent context banner (3 modes: jurisdiction/comparison/document); shown across all main product screens
    - `LawSectionCard` — Collapsible card for each law category
    - `EnforcementList` — Structured bullet list for enforcement options
    - `UnsupportedStateNotice` — Amber notice card for states not in the dataset
    - `Header`, `Footer` — App-wide chrome with mobile hamburger drawer nav
  - `client/src/components/ui/` — shadcn/ui base components
- **Session Persistence**: `useJurisdiction` hook reads/writes `"custody_jurisdiction"` to `sessionStorage`. JurisdictionPage, AskAIPage all write on load; WorkspacePage reads it to populate the dashboard without requiring re-entry.

### Backend (Node.js + Express)

- **Runtime**: Node.js with TypeScript (via `tsx` in dev, esbuild bundle in prod)
- **Framework**: Express 5
- **Key Routes** (in `server/routes.ts`):
  - `POST /api/geocode/coordinates` — Reverse geocode GPS coords → state + county via Google Maps API
  - `POST /api/geocode/zip` — Forward geocode ZIP code → state + county via Google Maps API
  - `GET /api/custody-laws/:state` — Serve custody law data from the static JSON file
  - `POST /api/ask` — Accept a jurisdiction + user question, return structured AI response via OpenAI
- **Data access**: `server/custody-laws-store.ts` abstracts all reads from `data/custody_laws.json` (DB-ready interface with `getCustodyLaw(state)` and `listStates()`)
- **User storage**: In-memory `MemStorage` class (no persistent user data; user locations are never stored)

### Data Layer

- **Custody law data**: Flat JSON file (`data/custody_laws.json`) covering 22 US states. Each entry has 7 snake_case fields: `state_code`, `custody_standard`, `custody_types`, `modification_rules`, `relocation_rules`, `enforcement_options`, `mediation_requirements`. Accessed exclusively through `server/custody-laws-store.ts` (swap for a DB query without touching routes.ts).
- **Database (Drizzle + PostgreSQL)**: Configured via `drizzle.config.ts` and `shared/models/chat.ts`. The schema defines `conversations` and `messages` tables for conversation history (used by Replit integration modules). The main app flow does **not** require the database — it's used only by the chat/audio Replit integration routes.
- **Schema validation**: Zod schemas in `shared/schema.ts` validate all API inputs/outputs.

### Authentication & Authorization

- No user authentication is implemented. The app is fully public.
- Location data is not persisted server-side.

### Shared Types

- `shared/schema.ts` defines Zod schemas and TypeScript types shared between client and server:
  - `Jurisdiction` — state, county, country, formattedAddress
  - `CustodyLawRecord` — 7 snake_case fields for one state's custody law data (`CustodyLaw` is a deprecated alias)
  - `AskAIRequest` — jurisdiction + user question
  - `AILegalResponse` — structured AI answer (summary, key points, attorney questions)

### Build System

- **Dev**: `tsx server/index.ts` runs the Express server; Vite middleware serves the React app with HMR
- **Production**: `script/build.ts` runs Vite build (outputs to `dist/public/`) then esbuild bundles the server to `dist/index.cjs`
- **Path aliases**: `@/` → `client/src/`, `@shared/` → `shared/`

### Replit Integration Modules

The repo contains optional Replit-scaffolded integration modules under `server/replit_integrations/` and `client/replit_integrations/`:
- **chat**: Conversation/message CRUD routes backed by Drizzle/Postgres
- **audio**: Voice recording, PCM16 streaming playback, speech-to-text, TTS via OpenAI
- **image**: Image generation/editing via OpenAI `gpt-image-1`
- **batch**: Rate-limited batch processing utility with retry logic

These modules are not wired into the main app routes by default but can be registered if needed.

---

## External Dependencies

### APIs & Services

| Service | Purpose | Env Variable |
|---|---|---|
| Google Maps Geocoding API | Convert GPS coordinates or ZIP codes to state/county jurisdiction | `GOOGLE_MAPS_API_KEY` |
| OpenAI Chat Completions | Answer user custody law questions in plain English, returning structured JSON responses | `OPENAI_API_KEY` or `AI_INTEGRATIONS_OPENAI_API_KEY` |

### Key npm Dependencies

| Package | Role |
|---|---|
| `express` v5 | HTTP server |
| `openai` | OpenAI API client |
| `drizzle-orm` + `drizzle-kit` | ORM for PostgreSQL (used by chat/audio integrations) |
| `pg` + `connect-pg-simple` | PostgreSQL driver and session store |
| `zod` + `drizzle-zod` | Runtime validation, schema inference |
| `@tanstack/react-query` | Client-side data fetching and caching |
| `wouter` | Lightweight React router |
| `@radix-ui/*` | Accessible UI primitives (via shadcn/ui) |
| `tailwind-merge` + `clsx` | CSS class utilities |
| `vite` + `@vitejs/plugin-react` | Frontend build tooling |
| `tsx` + `esbuild` | TypeScript execution and server bundling |

### Environment Variables Required

```
GOOGLE_MAPS_API_KEY=        # Google Maps Geocoding API key
OPENAI_API_KEY=             # OpenAI API key (or AI_INTEGRATIONS_OPENAI_API_KEY for Replit AI)
DATABASE_URL=               # PostgreSQL connection string (only needed for chat/audio integrations)
```