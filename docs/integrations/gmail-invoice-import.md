# Gmail invoice import

The subscription detail page can connect the current user's Gmail account,
search for matching PDF invoices, and import a selected attachment into the
existing private Documents storage. The imported document is linked to the
subscription and does not create a Money transaction automatically.

## Data flow

1. The user starts OAuth from `/subscriptions/[subscriptionId]`.
2. Google grants the read-only Gmail scope and returns a one-time code.
3. The server exchanges the code and AES-256-GCM encrypts the refresh token.
4. A manual search uses the subscription name and website domain, is limited to
   PDF attachments from the last 24 months, and returns metadata only.
5. The selected PDF is downloaded server-side, validated by the standard
   Documents pipeline, stored in private Supabase Storage, and linked to the
   subscription.

OAuth credentials and Gmail import idempotency rows are backend-only tables.
`anon` and `authenticated` have no grants; only the service-role client can use
them. Disconnecting Gmail attempts to revoke the Google token, then removes the
local encrypted credential.

## Google Cloud setup

1. Create or choose a Google Cloud project and enable Gmail API.
2. Configure the OAuth consent screen.
3. Create a Web application OAuth client.
4. Add the exact authorized redirect URI:
   `http://localhost:3000/api/integrations/gmail/callback` for local development,
   and the equivalent HTTPS URL for each deployed environment.
5. For production use, complete the Google verification required for the
   restricted `https://www.googleapis.com/auth/gmail.readonly` scope. Apps that
   store or transmit restricted-scope data on servers may also require a
   security assessment.

## Environment

Copy the Gmail variables from `.env.example` into the local/deployment secret
store. Generate the encryption key once and keep it stable; rotating or losing
it makes existing refresh tokens unreadable.

```sh
openssl rand -hex 32
```

Required variables:

- `GOOGLE_GMAIL_CLIENT_ID`
- `GOOGLE_GMAIL_CLIENT_SECRET`
- `GMAIL_TOKEN_ENCRYPTION_KEY`
- `NEXT_PUBLIC_APP_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

`GOOGLE_GMAIL_REDIRECT_URI` is optional and overrides the callback derived from
`NEXT_PUBLIC_APP_URL`.

## Database and verification

Apply `supabase/migrations/116_gmail_invoice_import.sql`, restart the app, open a
subscription, and use **Connect Gmail**. Useful local checks:

```sh
npx vitest run modules/integrations/gmail
npx tsc --noEmit
npm run build
```
