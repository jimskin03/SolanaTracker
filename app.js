/**
 * Solana Wallet Balance Tracker (static / GitHub Pages)
 *
 * Limitations to keep in mind:
 * - Browser calls go to JSON-RPC (CORS + rate limits apply).
 * - Public RPCs throttle; Helius (or similar) is better for testing.
 * - API keys in client JS are visible in DevTools — fine for throwaway testing only.
 *   For production, proxy RPC through a serverless function and keep the key server-side.
 * - Avoid Ankr's open URL (https://rpc.ankr.com/solana) — it returns HTTP 403 without a key.
 * - SOL→USD uses CoinGecko’s public API (also rate-limited; USD is best-effort).
 * - Address checks are structural (base58 + byte length), not on-curve proofs.
 */

(function () {
  "use strict";

  // --- Config -----------------------------------------------------------------

  /**
   * Primary mainnet RPC.
   * Testing: Helius with api-key in the URL (visible to anyone who loads the page).
   * Production: point this at your own proxy instead of embedding a key.
   */
  const RPC_URL =
    "https://mainnet.helius-rpc.com/?api-key=93fb3ea3-19e4-4647-afa7-0c76befea57d";

  /**
   * Fallbacks if primary fails (network / 429 / 5xx).
   * Do NOT use https://rpc.ankr.com/solana — public access returns HTTP 403.
   */
  const RPC_FALLBACKS = [
    "https://api.mainnet-beta.solana.com",
  ];

  const LAMPORTS_PER_SOL = 1_000_000_000;
  const REQUEST_TIMEOUT_MS = 12_000;
  const COINGECKO_URL =
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";

  // Base58 alphabet used by Solana addresses (Bitcoin alphabet, no 0/O/I/l)
  const BASE58_ALPHABET =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  // --- DOM --------------------------------------------------------------------

  const form = document.getElementById("balance-form");
  const input = document.getElementById("wallet-address");
  const checkBtn = document.getElementById("check-btn");
  const btnLabel = checkBtn.querySelector(".btn-label");
  const btnSpinner = checkBtn.querySelector(".btn-spinner");
  const statusEl = document.getElementById("status");
  const resultEl = document.getElementById("result");
  const balanceAmountEl = document.getElementById("balance-amount");
  const balanceUsdEl = document.getElementById("balance-usd");
  const displayAddressEl = document.getElementById("display-address");
  const lamportsEl = document.getElementById("lamports");
  const explorerLink = document.getElementById("explorer-link");
  const copyBtn = document.getElementById("copy-btn");
  const networkLabel = document.getElementById("network-label");

  let lastAddress = "";
  let solPriceUsd = null;
  let priceFetchedAt = 0;

  // --- Utils ------------------------------------------------------------------

  function setLoading(isLoading) {
    checkBtn.disabled = isLoading;
    input.disabled = isLoading;
    btnLabel.textContent = isLoading ? "Checking…" : "Check";
    btnSpinner.classList.toggle("hidden", !isLoading);
  }

  function hideStatus() {
    statusEl.classList.add("hidden");
    statusEl.textContent = "";
    statusEl.classList.remove("error", "info");
  }

  function showError(message) {
    resultEl.classList.add("hidden");
    statusEl.textContent = message;
    statusEl.classList.remove("hidden", "info");
    statusEl.classList.add("error");
  }

  function showInfo(message) {
    statusEl.textContent = message;
    statusEl.classList.remove("hidden", "error");
    statusEl.classList.add("info");
  }

  /**
   * Lightweight Solana address validation for UX.
   * Accepts base58 strings that decode to 32 bytes (ed25519 pubkey).
   */
  function isValidSolanaAddress(address) {
    if (typeof address !== "string") return false;
    const trimmed = address.trim();
    // Typical mainnet addresses are 32–44 chars; reject obvious junk early
    if (trimmed.length < 32 || trimmed.length > 44) return false;
    for (let i = 0; i < trimmed.length; i++) {
      if (BASE58_ALPHABET.indexOf(trimmed[i]) === -1) return false;
    }
    try {
      const bytes = decodeBase58(trimmed);
      return bytes.length === 32;
    } catch {
      return false;
    }
  }

  function decodeBase58(str) {
    if (str.length === 0) return new Uint8Array(0);

    const bytes = [0];
    for (let i = 0; i < str.length; i++) {
      const value = BASE58_ALPHABET.indexOf(str[i]);
      if (value < 0) throw new Error("Invalid base58 character");

      let carry = value;
      for (let j = 0; j < bytes.length; j++) {
        carry += bytes[j] * 58;
        bytes[j] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }

    // Leading zeros in base58 are '1'
    for (let i = 0; i < str.length && str[i] === "1"; i++) {
      bytes.push(0);
    }

    return Uint8Array.from(bytes.reverse());
  }

  function formatSol(lamports) {
    const sol = Number(lamports) / LAMPORTS_PER_SOL;
    // Up to 9 fractional digits (lamport precision), trim trailing zeros
    return sol.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 9,
    });
  }

  function formatUsd(solAmount, price) {
    if (price == null || Number.isNaN(price)) return "USD price unavailable";
    const usd = solAmount * price;
    return (
      "≈ " +
      usd.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: usd < 1 ? 4 : 2,
      })
    );
  }

  function shortenAddress(address) {
    if (address.length <= 12) return address;
    return address.slice(0, 4) + "…" + address.slice(-4);
  }

  /** Host only — never log full URLs that may contain api-key= */
  function safeRpcHost(endpoint) {
    try {
      return new URL(endpoint).host;
    } catch {
      return "RPC";
    }
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  // --- RPC --------------------------------------------------------------------

  async function rpcGetBalance(address, endpoint) {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [address, { commitment: "confirmed" }],
    };

    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.status === 429) {
      const err = new Error(
        "RPC rate limit reached (HTTP 429). Try again shortly or switch RPC_URL."
      );
      err.code = "RATE_LIMIT";
      err.status = 429;
      err.endpoint = endpoint;
      throw err;
    }

    if (!response.ok) {
      let detail = "";
      try {
        const text = await response.text();
        if (text) {
          try {
            const j = JSON.parse(text);
            detail =
              (j && (j.message || (j.error && j.error.message))) ||
              text.slice(0, 160);
          } catch {
            detail = text.slice(0, 160);
          }
        }
      } catch {
        // ignore body read failures
      }

      const host = safeRpcHost(endpoint);
      let message = `RPC HTTP ${response.status} from ${host}`;

      if (response.status === 401 || response.status === 403) {
        message +=
          ". Access denied — invalid/revoked API key, or this endpoint blocks browser/public access.";
        if (host.indexOf("ankr.com") !== -1) {
          message +=
            " Ankr public URLs require a project key; remove Ankr from RPC_FALLBACKS.";
        }
      } else if (detail) {
        message += ` — ${detail}`;
      }

      const err = new Error(message);
      err.code = "HTTP";
      err.status = response.status;
      err.endpoint = endpoint;
      throw err;
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      const err = new Error("Invalid JSON from RPC endpoint.");
      err.code = "PARSE";
      throw err;
    }

    if (payload.error) {
      const msg = payload.error.message || "RPC returned an error.";
      const err = new Error(msg);
      err.code = payload.error.code;
      throw err;
    }

    if (
      !payload.result ||
      typeof payload.result.value !== "number" ||
      !Number.isFinite(payload.result.value)
    ) {
      const err = new Error("Unexpected RPC response shape.");
      err.code = "SHAPE";
      throw err;
    }

    return payload.result.value;
  }

  async function getBalanceWithFallback(address) {
    const endpoints = [RPC_URL, ...RPC_FALLBACKS];
    let lastError = null;

    for (let i = 0; i < endpoints.length; i++) {
      const endpoint = endpoints[i];
      try {
        const lamports = await rpcGetBalance(address, endpoint);
        return { lamports, endpoint };
      } catch (err) {
        lastError = err;
        // Abort / network: try next. Invalid params: no point retrying other RPCs.
        if (err.name === "AbortError") {
          lastError = new Error("Request timed out. The RPC may be slow or blocked.");
          continue;
        }
        // -32602 invalid params / bad pubkey — stop early
        if (err.code === -32602) break;
        continue;
      }
    }

    throw lastError || new Error("All RPC endpoints failed.");
  }

  async function fetchSolPriceUsd() {
    const CACHE_MS = 60_000;
    if (solPriceUsd != null && Date.now() - priceFetchedAt < CACHE_MS) {
      return solPriceUsd;
    }

    try {
      const res = await fetchWithTimeout(COINGECKO_URL, {}, 8000);
      if (!res.ok) return solPriceUsd;
      const data = await res.json();
      const price = data && data.solana && data.solana.usd;
      if (typeof price === "number" && price > 0) {
        solPriceUsd = price;
        priceFetchedAt = Date.now();
      }
    } catch {
      // USD is optional; ignore failures
    }
    return solPriceUsd;
  }

  // --- UI actions -------------------------------------------------------------

  function renderResult(address, lamports) {
    const sol = lamports / LAMPORTS_PER_SOL;
    lastAddress = address;

    balanceAmountEl.textContent = formatSol(lamports);
    lamportsEl.textContent = Number(lamports).toLocaleString("en-US");
    displayAddressEl.textContent = address;
    displayAddressEl.title = address;
    explorerLink.href = "https://solscan.io/account/" + encodeURIComponent(address);
    networkLabel.textContent = "mainnet-beta";

    balanceUsdEl.textContent =
      solPriceUsd != null ? formatUsd(sol, solPriceUsd) : "Fetching USD…";

    hideStatus();
    resultEl.classList.remove("hidden");

    // Refresh USD asynchronously so balance shows immediately
    fetchSolPriceUsd().then((price) => {
      if (lastAddress === address) {
        balanceUsdEl.textContent = formatUsd(sol, price);
      }
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    hideStatus();
    resultEl.classList.add("hidden");
    input.classList.remove("is-invalid");

    const address = (input.value || "").trim();

    if (!address) {
      input.classList.add("is-invalid");
      showError("Enter a Solana wallet address.");
      input.focus();
      return;
    }

    if (!isValidSolanaAddress(address)) {
      input.classList.add("is-invalid");
      showError(
        "That doesn’t look like a valid Solana address. Use a base58 public key (32 bytes when decoded)."
      );
      input.focus();
      return;
    }

    setLoading(true);
    showInfo("Contacting Solana RPC…");

    try {
      // Kick off price fetch in parallel with balance
      const pricePromise = fetchSolPriceUsd();
      const { lamports } = await getBalanceWithFallback(address);
      await pricePromise;
      renderResult(address, lamports);
    } catch (err) {
      console.error(err);
      let message = err && err.message ? err.message : "Something went wrong.";

      if (err && err.name === "TypeError") {
        // Often CORS or offline
        message =
          "Network error talking to the RPC (offline, blocked, or CORS). " +
          "Try again or set RPC_URL in app.js to a provider that allows browser access.";
      }

      showError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!lastAddress) return;
    try {
      await navigator.clipboard.writeText(lastAddress);
      const prev = copyBtn.getAttribute("title");
      copyBtn.setAttribute("title", "Copied!");
      setTimeout(() => copyBtn.setAttribute("title", prev || "Copy address"), 1200);
    } catch {
      // Fallback for older browsers / denied permission
      const range = document.createRange();
      range.selectNodeContents(displayAddressEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  // Prefill from ?address= query (shareable links)
  function applyQueryPrefill() {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("address") || params.get("wallet");
      if (q) {
        input.value = q.trim();
      }
    } catch {
      // ignore
    }
  }

  // --- Init -------------------------------------------------------------------

  form.addEventListener("submit", handleSubmit);
  copyBtn.addEventListener("click", handleCopy);

  input.addEventListener("input", () => {
    input.classList.remove("is-invalid");
    if (!statusEl.classList.contains("hidden") && statusEl.classList.contains("error")) {
      hideStatus();
    }
  });

  applyQueryPrefill();

  // Warm price cache (non-blocking)
  fetchSolPriceUsd();
})();
