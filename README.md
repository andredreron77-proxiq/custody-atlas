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

### Environment Variables

Create a `.env` file or set the following environment variables:

```
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5000`.

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
├── client/
│   └── src/
│       ├── components/
│       │   └── app/
│       │       ├── Header.tsx          # Navigation header + breadcrumbs
│       │       ├── Footer.tsx          # Site footer with disclaimer
│       │       ├── LocationSelector.tsx # GPS + ZIP code input component
│       │       ├── JurisdictionCard.tsx # Displays detected jurisdiction
│       │       ├── LawSummarySection.tsx# Expandable law sections
│       │       └── ChatBox.tsx         # AI chat interface
│       ├── pages/
│       │   ├── LandingPage.tsx         # Hero + features + CTA
│       │   ├── LocationPage.tsx        # Location input page
│       │   ├── JurisdictionPage.tsx    # Law summary for jurisdiction
│       │   └── AskAIPage.tsx           # AI Q&A chat interface
│       └── App.tsx                     # Router setup
├── server/
│   ├── routes.ts                       # API endpoints
│   ├── storage.ts                      # Storage interface
│   └── index.ts                        # Express server
├── shared/
│   └── schema.ts                       # Shared TypeScript types/schemas
└── data/
    └── custody_laws.json               # Custody law data for 16 states
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/geocode/coordinates` | Convert lat/lng to jurisdiction |
| POST | `/api/geocode/zip` | Convert ZIP code to jurisdiction |
| GET | `/api/custody-laws` | List all states with data |
| GET | `/api/custody-laws/:state` | Get custody law for a state |
| POST | `/api/ask` | Ask AI a custody question |

## States Covered

Alabama, Alaska, Arizona, California, Colorado, Florida, Georgia, Illinois, Michigan, New York, North Carolina, Ohio, Pennsylvania, Texas, Virginia, Washington

## Legal Disclaimer

This application provides general legal information for educational purposes only. It does not constitute legal advice. Always consult a licensed family law attorney in your jurisdiction for advice specific to your situation.

## Browser QA (Playwright)

A minimal reusable Playwright QA foundation is available under `qa/`.

```bash
npm run qa:test
```

See `qa/README.md` for required test account env vars and flow coverage.
