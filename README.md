# Grace and Truth Came Through Jesus Christ

This is a mobile-first HTML/CSS/vanilla JavaScript church website with a small Node/Express backend for automatic Facebook Live detection.

## Run in VS Code

1. Install Node.js 18 or newer.
2. Open this folder in VS Code.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and replace every `REPLACE_ME` value.
5. Run `npm start` or `npm run dev`.
6. Open `http://localhost:3000/live.html`.

### Windows one-click launch

Double-click `launch-church.bat` in the project folder. It installs dependencies if needed, starts the secure backend in the background, and opens the correct login page automatically. After you click **Sign in**, the server redirects an account with the correct admin code to `/admin.html`; all other accounts go to `/user.html`.

A web browser cannot launch a Windows process by itself when a button is clicked. The launcher must start the backend before the login request can be sent. This keeps the admin code and password verification secure instead of exposing them in browser JavaScript.

You can also press `Ctrl+Shift+P` in VS Code, choose **Tasks: Run Task**, and select **Start Grace and Truth website**. Then open `http://localhost:3000/login.html`.

Do not open `login.html`, `admin.html`, or `live.html` directly from the file system or through a static-only preview extension. Authentication and Facebook Live need the backend API. Use `launch-church.bat` or the VS Code task instead.

## Facebook Live architecture

The browser never receives `META_APP_SECRET` or `META_PAGE_ACCESS_TOKEN`.

1. Meta sends a Page `live_videos` webhook to `POST /webhooks/facebook` when a broadcast starts or ends.
2. The server verifies `X-Hub-Signature-256` with the App Secret.
3. The server resolves the video permalink through the Graph API using the Page access token.
4. The server stores only the current public video state in `data/live-state.json`.
5. The browser polls `GET /api/live` and renders Meta's official Embedded Video Player using the returned public permalink.

This avoids asking the church to paste a new URL for each broadcast. The current Meta Page Live Videos reference marks reading the Page `live_videos` edge as unavailable, so this project does not invent a polling endpoint. It uses the supported webhook notification plus video lookup flow. The webhook must be reachable from the public internet in production.

## Meta Developer setup

1. Go to [Meta for Developers](https://developers.facebook.com/apps/) and create an app. Choose a business or suitable app type.
2. Add Facebook Login for Business if Meta requests it, then create an App ID.
3. Add the App Domains for your production domain. Add `localhost` only for local testing where Meta permits it.
4. In the app dashboard, open Webhooks, choose the `Page` object, and subscribe to the `live_videos` field.
5. Set the callback URL to `https://YOUR_PUBLIC_DOMAIN/webhooks/facebook`.
6. Set the Verify Token to the same random value as `META_WEBHOOK_VERIFY_TOKEN` in `.env`.
7. Subscribe the app to the church Page. Meta will call the verification endpoint; it must return the challenge, which this server handles.
8. In the Page access flow, grant the app access to the church Page and generate a long-lived Page access token.

### Required values in `.env`

- `META_APP_ID`: the App ID from Meta Developer Dashboard.
- `META_APP_SECRET`: the App Secret. Server only.
- `META_PAGE_ID`: numeric ID of the church Facebook Page.
- `META_PAGE_ACCESS_TOKEN`: long-lived token for that Page. Server only.
- `META_WEBHOOK_VERIFY_TOKEN`: any long random string you create. It is not the App Secret.
- `PUBLIC_SITE_URL`: your public HTTPS site URL.
- `META_GRAPH_VERSION`: keep the current version shown by Meta's Graph API documentation; this starter defaults to `v26.0`.

### Permissions and Page ID

Request the least privileges Meta grants for your exact app and Page flow. The webhook subscription requires Page management metadata access, commonly `pages_manage_metadata`. Reading Page/video data may also require `pages_read_engagement` and Meta App Review. Meta can change eligibility and permission names, so confirm the permissions displayed in the current access-token debugger and app review dashboard rather than copying a token from a tutorial.

To find the Page ID, open the Page in Facebook, choose **About**, and look for **Page transparency** or **Page ID**. You can also use Meta's Page access-token flow and the `/me/accounts` response while authenticated as a Page manager. Put the numeric Page ID in `META_PAGE_ID`, never in browser JavaScript as a secret.

## Testing

- `GET http://localhost:3000/api/health` confirms the server is running and reports whether the required Meta values exist.
- `GET http://localhost:3000/api/live` should initially return `active: false`.
- Use Meta's Webhooks test tool to send a Page `live_videos` event after your callback is public.
- Start a real Page broadcast and watch the server terminal. The webhook changes `data/live-state.json`; refresh `live.html` to see the official player.
- End the broadcast. The end webhook clears the state and the page returns to the offline message.

For local webhook testing, expose the local port through an HTTPS tunnel such as ngrok or Cloudflare Tunnel, then use that public HTTPS URL in Meta. Do not commit `.env` or access tokens.

## Offline and new broadcasts

When offline, `/api/live` returns `active: false`, the player is not rendered, and the page displays “We are not live right now.” When a new broadcast begins, Meta sends a new webhook with its video ID. The backend replaces the old state automatically, fetches the new permalink, and the next client refresh displays the new broadcast without any code or URL change.

## Sign in and roles

The standalone portal login is available by opening `login.html` directly. Enter `selectedfew` to open `admin.html`, or enter `lifeinchrist` to open `user.html`. The browser shows the matching portal alert and stores the active portal in `sessionStorage`.

The standalone admin editor saves announcements, sermon notes, text, and selected files in that browser's `localStorage`. Those files are not uploaded to a shared website. This mode does not provide real security because browser-only codes can be inspected; use the Node backend authentication flow for a production-protected admin area.

The Facebook Live feature still requires `server.js` because Meta webhooks and access tokens cannot run securely in a static HTML file.

## Church Bible assistant

The users portal includes a local Bible Q&A assistant. It does not call Google, an external search engine, or an external AI service. It matches the user's question against the starter church knowledge and entries added by the admin in `admin.html`.

Admins can add a question, an approved answer, and a Bible reference under **Bible assistant knowledge**. The entries are saved in that browser's `localStorage`, and users on the same browser/device can ask about them from `user.html`. Unknown questions receive a clear “not in the study knowledge yet” response rather than an invented answer.


This file-backed account store is suitable for a single-server starter deployment. Use a managed database and rotate `SESSION_SECRET` before production at larger scale.

## Other site integrations

The Paystack and Flutterwave buttons are integration points. Replace their placeholder handlers with your merchant public keys and server-side payment verification before accepting money. The `/admin.html` sermon form currently stores metadata in browser `localStorage`; connect it to authenticated server storage before production uploads.
