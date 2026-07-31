# Solana Wallet Balance Tracker

A minimal **static** web app: paste a Solana wallet address, see its **SOL balance** (and an approximate USD value).

Built to run on **GitHub Pages** with no build step and no backend.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Static](https://img.shields.io/badge/hosting-GitHub%20Pages-2088FF?logo=github)

WEBSITE IS LIVE NOW AT 
https://solana.free.je/

Visit the live site: [https://solana.free.je/](https://solana.free.je/)

## Features

- Wallet address input with base58 / 32-byte validation
- Mainnet SOL balance via Solana JSON-RPC `getBalance`
- Automatic fallback across a few public RPC endpoints
- Approximate USD value (CoinGecko, best-effort)
- Link to Solscan + copy address
- Shareable URLs: `?address=<pubkey>`
- Responsive dark UI, no frameworks, no bundler

THIS IS BUILT FOR TESTING AND EDUCATIONAL PURPOSES. API IS NOT HIDDEN. USING HELIUS FREE TIER

## Live demo

After you enable GitHub Pages (see below):

`https://<your-username>.github.io/<repo-name>/`

## Quick start (local)

Open `index.html` in a browser, or serve the folder:

```bash
# Python
python -m http.server 8080

# Node
npx --yes serve .
```

Then visit `http://localhost:8080`.

> Loading via `file://` often works, but some browsers restrict `fetch` or clipboard APIs. A local static server is more reliable.

## Deploy on GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages**
3. **Source**: Deploy from a branch
4. **Branch**: `main` (or `master`), folder `/ (root)`
5. Save. After a minute, open the Pages URL.

No Actions workflow is required; the site is plain HTML/CSS/JS.

### Project pages vs user site

| Type | Repo name | URL |
|------|-----------|-----|
| Project site | any name | `https://user.github.io/repo/` |
| User/org site | `user.github.io` | `https://user.github.io/` |

Paths are relative (`styles.css`, `app.js`), so both work without changes.

## How it works

```text
Browser
  │
  ├─ POST getBalance ──► Solana JSON-RPC (public mainnet)
  │
  └─ GET simple/price ─► CoinGecko (optional USD)
```

Balance is returned in **lamports** (`1 SOL = 1_000_000_000` lamports) and converted in the client.

Relevant code:

- [`app.js`](app.js) — validation, RPC, UI
- [`index.html`](index.html) — markup
- [`styles.css`](styles.css) — layout / theme

## Configuration

Edit the top of [`app.js`](app.js):

```js
// Primary — Helius (key in URL is visible in the browser; OK for throwaway testing only)
const RPC_URL =
  "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY";

// Fallback if Helius fails (rate-limited public RPC; browser CORS OK)
const RPC_FALLBACKS = [
  "https://api.mainnet-beta.solana.com",
];
```

**Do not use** `https://rpc.ankr.com/solana` as a fallback — Ankr’s open URL returns **HTTP 403** without a project API key.

### Using Helius (testing)

1. Create an API key in the [Helius dashboard](https://dashboard.helius.dev/).
2. Set `RPC_URL` to
   `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY`
3. Keep a public fallback such as `https://api.mainnet-beta.solana.com`.

Keys embedded in static JS are **public** (View Source / Network tab). Fine for personal testing; for anything real, proxy RPC through a Worker/Function and store the key as a server secret.

### Using your own RPC / hiding the key

1. Deploy a tiny serverless proxy (Cloudflare Worker, Netlify Function, Vercel `/api`).
2. Store `HELIUS_API_KEY` in the host’s environment / secrets — never in the repo.
3. Set `RPC_URL` in [`app.js`](app.js) to the proxy URL (no `api-key` query param).
4. Prefer providers (or proxies) that allow your site’s browser `Origin`.

## Compatibility & limitations

| Topic | Detail |
|-------|--------|
| Hosting | Static only — GitHub Pages, Cloudflare Pages, Netlify, S3, etc. |
| Backend | None. All calls are from the browser. |
| Network | **mainnet-beta** only (change RPC URL for devnet/testnet). |
| RPC limits | Public endpoints throttle (HTTP 429) and may change CORS policy. |
| CORS | If an RPC blocks browser origins, `fetch` fails; switch `RPC_URL`. |
| Accuracy | `commitment: "confirmed"`. Not a wallet; read-only balance. |
| Tokens | SOL native balance only — not SPL token accounts. |
| USD price | CoinGecko free API; may fail or lag; balance still shows. |
| Validation | Structural base58 + 32-byte length, not full ed25519 on-curve check. |
| Privacy | Address is sent to the RPC and (for USD) not required by CoinGecko. |
| Browsers | Modern evergreen browsers (ES2018+). No IE support. |

### GitHub Pages specifics

- HTTPS only on `*.github.io`
- No server-side code or environment secrets in Pages static hosting
- Soft bandwidth/CPU limits on GitHub’s side; fine for a personal tool
- Custom domains supported via repo Settings → Pages

## Usage

1. Paste a mainnet address (or open `?address=...`).
2. Click **Check**.
3. Read SOL balance, lamports, and optional USD.
4. Use **Open in Solscan** for full account history.

Example address format:

```text
7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

## Project layout

```text
.
├── index.html    # UI shell
├── styles.css    # Styles
├── app.js        # Logic + RPC
├── README.md     # You are here
└── LICENSE       # MIT
```

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| “Network error / CORS” | Change `RPC_URL` to another HTTPS provider; avoid `file://`. Use a local static server. |
| HTTP 403 from `rpc.ankr.com` | Expected on Ankr’s public URL. Remove Ankr; use Helius or `api.mainnet-beta.solana.com`. |
| HTTP 401/403 from Helius | Invalid/revoked API key, or key restrictions. Check the Helius dashboard. |
| HTTP 429 / rate limit | Wait, or use Helius / another personal RPC tier. |
| Still seeing old RPC errors | Hard-refresh (Ctrl+F5) so the browser loads the latest `app.js`. |
| Invalid address | Confirm base58 pubkey (Explorer / Phantom copy). |
| USD shows unavailable | CoinGecko blocked or rate-limited; SOL balance is still valid. |
| Blank page on Pages | Ensure `index.html` is at repo root (or docs/) matching Pages setting. |

## Security notes

- This app **never** asks for a private key or seed phrase.
- It only performs read-only RPC `getBalance`.
- Treat any site that asks for a secret key as malicious.

## License

MIT — see [LICENSE](LICENSE).
