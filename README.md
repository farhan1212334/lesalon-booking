# Le Salon NYC Booking

## Deploy frontend and API together on Vercel

Deploy the repository root as one Vercel project. In the Vercel project settings, set **Root Directory** to the repository root (not `client` or `server`). The included `vercel.json` builds the Vite client into `client/dist`; `api/[...route].js` serves the Express booking API from the same domain.

Add these environment variables to the Vercel project:

- `DATABASE_URL` (required): PostgreSQL connection string.
- `BREVO_API_KEY` (required for booking emails): Brevo API key.
- `SENDER_EMAIL` (required for booking emails): verified sender email address.
- `ADMIN_EMAIL` (required for booking emails): salon notification address.
- `ADMIN_PIN` (required for the admin panel): exactly six digits. Sign-in is locked for 15 minutes after five incorrect attempts from the same client.
- `REPLY_TO_EMAIL` (optional): reply-to address.

Do not set `VITE_API_BASE_URL`; the client calls `/api` on its own domain. Redeploy after updating the root directory or environment variables.

The Admin tab requires the `ADMIN_PIN` environment variable (exactly six digits) and uses
database-backed sessions in an HTTP-only, same-site cookie. PIN failures are
rate-limited using PostgreSQL. Signed-in admins can browse appointments in a
day/week calendar or the existing paginated list, search and filter records,
and cancel appointments stored in PostgreSQL. Admin cancellations use the
existing customer cancellation email flow.

Confirmed appointments reserve their time interval across all stylists. Booking
requests for the same date are serialized in PostgreSQL before checking for
overlaps, so concurrent submissions cannot claim an already-booked time.

## Local development

Start the API from `server` with `npm start`, then start the client from `client` with `npm run dev`. Vite proxies `/api` requests to `http://localhost:5000`. Configure the backend environment as described in `server/.env.example`.
