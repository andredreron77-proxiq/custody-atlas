# Custody Atlas

## Overview

Custody Atlas is a production-ready web application providing users with jurisdiction-specific child custody law information within the US (state and county). It allows users to:

1.  Input their location (GPS or ZIP code).
2.  Access structured summaries of custody laws across six key areas: custody standard, custody types, modification, relocation, enforcement, and mediation requirements.
3.  Query an AI assistant about custody law in their specified jurisdiction.

The application aims to be a comprehensive resource for understanding child custody laws, with future ambitions for broader state coverage and enhanced AI capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## Design System

### Tokens (index.css + tailwind.config.ts)
- **Primary**: navy `222 47% 11%` (light) / blue `217 91% 60%` (dark)
- **Gold accent**: `--gold: 38 56% 43%` (light) / `38 60% 55%` (dark) — Tailwind: `bg-gold`, `text-gold`
- **Border radius**: `rounded-lg` = 12px, `rounded-md` = 8px, `rounded-sm` = 4px
- **Shadows**: `shadow-sm` on cards, `shadow-xs` on icon marks/badges — no elevation on non-interactive cards
- **Semantic status colors**: amber=county procedures, blue=document scope indicator, green=confirmations, red=destructive

### Motion
- `animate-fade-in` (220ms ease, 5px translateY) — applied to PageShell, PageShellWide, AuthRequiredCard, LawSectionCard expand content, CollapsibleSection open content
- `animate-fade-in-fast` (140ms, opacity only), `animate-slide-down` (180ms) available globally
- Respects `prefers-reduced-motion`
- All interactive elements use `transition-colors` via the `hover-elevate` / `active-elevate` system or explicit classes

### Layout Primitives (PageShell.tsx)
- `PageShell` — max-w-4xl centred wrapper with entrance animation
- `PageShellWide` — max-w-5xl for data-dense pages
- `PageHeader` — eyebrow + serif h1 + subtitle + optional right slot
- `SectionLabel` — 11px uppercase tracking label
- `Divider` — subtle hr
- `EmptyState` — icon + title + description + optional action; consistent zero-data treatment
- `InfoRow` — labelled key/value row for detail panels

### Typography
- Page titles: `font-serif text-2xl md:text-3xl font-semibold` via PageHeader
- Card section titles: `text-sm font-semibold` (override CardTitle default of `text-base`)
- Section labels: `text-[11px] font-semibold uppercase tracking-widest text-muted-foreground`
- Body: `text-sm leading-relaxed text-muted-foreground`
- Lead sentences (LawSectionCard): `text-sm font-medium text-foreground`

### No Hardcoded Colors in App Pages
- All slate/gray utility classes replaced with `text-foreground`, `text-muted-foreground`, `bg-background`, `bg-muted`
- Semantic status colors (amber for county, blue for doc scope, green/red) are intentional
- Header/Footer/AuthButton use slate for on-dark-navy contrast — also intentional

## System Architecture

### Frontend (React + TypeScript)

The frontend is a single-page application built with React 18, TypeScript, and Vite. It utilizes Wouter for routing, TanStack Query for server state management, and shadcn/ui (built on Radix UI and Tailwind CSS) for UI components and styling, including light/dark mode.

Key pages include:
*   `/`: Landing page.
*   `/workspace`: Case Workspace dashboard.
*   `/location`: Location selection.
*   `/jurisdiction/:state/:county`: Displays detailed state custody law summaries.
*   `/ask`: AI Q&A chat interface.
*   `/upload-document`: Document OCR and AI analysis.
*   `/custody-map`: Interactive U.S. map for law exploration and comparison.
*   `/custody-questions/:slug`: SEO-friendly pages for common custody questions.
*   `/custody-laws/:stateSlug`: SEO-friendly public pages for specific states.
*   `/q/:stateSlug/:topic/:slug`: Dynamic SEO Q&A repository pages from user questions.
*   `/privacy`, `/terms`: Legal pages.

Session persistence for jurisdiction is managed via `sessionStorage`.

### Backend (Node.js + Express)

The backend is an Express 5 server running on Node.js with TypeScript. It handles API requests for geocoding (via Google Maps), serving custody law data from a static JSON file, and processing AI questions via OpenAI. Data access to custody laws is abstracted to allow for future database migration. User location data is not persisted.

### Data Layer

Custody law data is stored in a static JSON file (`data/custody_laws.json`) covering 22 US states, accessed via a dedicated store for abstraction. The system is configured with Drizzle ORM and PostgreSQL for optional Replit integration modules (chat history), but the core application does not currently rely on a persistent database for custody law data or user information. Zod schemas ensure API input/output validation.

### Authentication & Authorization

The application is fully public with no user authentication implemented. Location data is not persisted server-side. An admin system with user management and invite code functionality is present, requiring `ADMIN_EMAIL` for access and utilizing Supabase for user profiles and invite code management.

### Shared Types

Shared TypeScript types and Zod schemas (`shared/schema.ts`) define common data structures like `Jurisdiction`, `CustodyLawRecord`, `AskAIRequest`, and `AILegalResponse` for consistent client-server communication.

### Build System

Development uses `tsx` for the server and Vite for the frontend. Production builds use Vite for the frontend assets and esbuild for the Node.js server. Path aliases are configured for easier module imports.

### AI Entry Funnel

A module (`client/src/lib/aiEntry.ts`) allows contextual AI questions to be triggered from various CTA buttons throughout the app. It manages displaying the chatbox or navigating to the `/ask` page with pre-filled questions, and logs these interactions for analytics.

## External Dependencies

### APIs & Services

*   **Google Maps Geocoding API**: For converting GPS coordinates or ZIP codes to state/county jurisdictions.
*   **OpenAI Chat Completions**: For processing and generating structured AI responses to user custody law questions.
*   **Supabase**: Used for the Admin system's user management (auth, user profiles, invite codes).

### Key npm Dependencies

*   `express`: HTTP server framework.
*   `openai`: OpenAI API client.
*   `drizzle-orm`, `drizzle-kit`: ORM for PostgreSQL (primarily for Replit integration modules).
*   `zod`, `drizzle-zod`: Runtime validation and schema inference.
*   `@tanstack/react-query`: Client-side data fetching and caching.
*   `wouter`: Lightweight React router.
*   `@radix-ui/*`: Accessible UI primitives (via shadcn/ui).
*   `vite`, `@vitejs/plugin-react`: Frontend build tooling.
*   `tsx`, `esbuild`: TypeScript execution and server bundling.

### Environment Variables Required

*   `GOOGLE_MAPS_API_KEY`
*   `OPENAI_API_KEY` (or `AI_INTEGRATIONS_OPENAI_API_KEY`)
*   `DATABASE_URL` (only for chat/audio integrations)
*   `ADMIN_EMAIL`
*   `VITE_SUPABASE_URL`
*   `VITE_SUPABASE_ANON_KEY`
*   `SUPABASE_SERVICE_ROLE_KEY`
*   `SESSION_SECRET`