# WorkshopHub

WorkshopHub is a deterministic Next.js application used as a controlled test object for empirical evaluation of AI-based web frontend testing. It models workshop discovery, registration, registration cancellation, account-based workshop management, and feedback submission.

Only the workshop overview is publicly accessible. Opening a workshop detail page, registering, viewing registrations, submitting feedback, or using My Workshops requires a local WorkshopHub account. The header always shows `Events`; `My Registrations`, `My Workshops`, and `Feedback` are only available after login.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Plain CSS
- Next.js route handlers under `/api/...`
- SQLite database with deterministic seed data

No external APIs, authentication providers, analytics, telemetry, polling, timers, or random identifiers are used. Next.js telemetry is disabled through `NEXT_TELEMETRY_DISABLED=1` in the npm scripts and Docker image.

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Build the application with:

```bash
npm run build
```

Run the production build with:

```bash
npm run start
```

## Docker Setup

```bash
docker build -t workshophub .
docker run -p 3000:3000 workshophub
```

Open `http://localhost:3000`.

## Routes

- `/` redirects to `/events`
- `/events` shows the event overview with search, filters, and sorting
- `/events/[id]` requires login and shows event details and registration availability
- `/events/[id]/register` requires login and shows the registration form
- `/registrations` requires login and lists the current user's registrations
- `/registrations/[id]/edit` requires login and edits an active registration owned by the current user
- `/login` logs in with a local WorkshopHub account
- `/register` creates a local WorkshopHub account
- `/admin/events` shows owned workshops and their submitted feedback
- `/admin/events/new` creates a new workshop for the current user
- `/admin/events/[id]/edit` edits a workshop owned by the current user
- `/feedback` requires login and submits event feedback

## API Endpoints

- `GET /api/events`
- `GET /api/events?owner=me`
- `GET /api/events/:id`
- `POST /api/events`
- `PUT /api/events/:id`
- `PATCH /api/events/:id/cancel`
- `GET /api/registrations`
- `POST /api/registrations`
- `GET /api/registrations/:id`
- `PUT /api/registrations/:id`
- `PATCH /api/registrations/:id/cancel`
- `GET /api/auth/me`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/feedback`
- `POST /api/feedback`

## Seed Data

Seed data lives in `data/seed.ts`. On first access, the application creates a SQLite database, initializes the schema, and inserts deterministic seed records from that file. Remaining seats are computed from active registrations in the database. IDs are deterministic, for example `event-001`, `registration-001`, and `feedback-001`.

Seed user credentials for manual testing:

- Email: `ava.fischer@example.test`
- Password: `Password123`

Seed registrations belong to this user, so My Registrations is deterministic after logging in with that account.

By default, the SQLite file is stored at `.workshophub/workshophub.sqlite`. Set `WORKSHOPHUB_DB_PATH` to use a different file, for example in isolated test runs:

```bash
WORKSHOPHUB_DB_PATH=/tmp/workshophub-test.sqlite npm run dev
```

The fixed study date is `2026-06-12`. Workshop date validation uses this value instead of the real system date so repeated test runs remain reproducible.

## Testing-Relevant Design Decisions

- All frontend state changes use asynchronous HTTP requests to route handlers.
- UI controls use semantic HTML labels, headings, buttons, tables, and form fields.
- Validation errors and success messages are visible in the DOM.
- No artificial `data-testid` attributes are required for the implemented workflows.
- No animations, polling, background refreshes, external APIs, or random behavior are used.
- The SQLite data layer is intentionally small and explicit to keep expected state transitions inspectable.
