// script.js
// Replace rpcUrl with your RPC provider if needed.
// Note: public RPCs may require an API key or have rate limits/CORS restrictions.
const rpcUrl = "https://api.mainnet-beta.solana.com";
const LAMPORTS_PER_SOL = 1_000_000_000;

const walletAddressInput = document.getElementById("walletAddress");
const checkBtn = document.getElementById("checkBalance");
const balanceAmount = document.getElementById("balanceAmount");
const errorMessage = document.getElementById("errorMessage");

checkBtn.addEventListener("click", () => {
  const pubkey = walletAddressInput.value.trim();
  clearMessages();
  if (!pubkey) {
    showError("Please enter a Solana wallet address.");
    return;
  }
  fetchAndShowBalance(pubkey).catch(err => {
    showError(err.message || String(err));
    console.error(err);
  });
});

function clearMessages() {
  errorMessage.hidden = true;
  errorMessage.textContent = "";
  balanceAmount.textContent = "—";
}

function showError(msg) {
  errorMessage.hidden = false;
  errorMessage.textContent = msg;
}

// Truncate for UI-friendly error display
function truncate(s, n = 400) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "...(truncated)" : s;
}

async function fetchAndShowBalance(pubkey) {
  const lamports = await getSolanaBalance(rpcUrl, pubkey);
  const sol = (lamports / LAMPORTS_PER_SOL).toFixed(6);
  balanceAmount.textContent = sol;
}

// Robust getBalance that checks response type and logs raw body for debugging
async function getSolanaBalance(rpcUrl, pubkey) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getBalance",
    params: [pubkey]
  };

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  // Always read raw text so we can inspect HTML error pages or debugging output.
  const raw = await res.text();
  const contentType = (res.headers.get("content-type") || "").toLowerCase();

  if (!res.ok) {
    // Server returned a non-2xx status. Many servers return HTML error pages here.
    console.error("HTTP error", res.status, res.statusText, raw);
    // If it's HTML, show a specific hint
    if (contentType.includes("text/html") || raw.trim().startsWith("<")) {
      throw new Error(
        `Server returned HTML error page (HTTP ${res.status}). Response start: ${truncate(raw, 300)}`
      );
    }
    throw new Error(`HTTP ${res.status}: ${res.statusText} — ${truncate(raw, 300)}`);
  }

  // If server didn't send JSON content-type, warn and show start of body.
  if (!contentType.includes("application/json")) {
    console.error("Unexpected content-type", contentType, raw);
    if (raw.trim().startsWith("<")) {
      throw new Error(
        "Expected JSON but received HTML (likely an index or error page). " +
        "Check that rpcUrl points to an actual Solana JSON-RPC endpoint.\n\n" +
        truncate(raw, 300)
      );
    } else {
      throw new Error("Unexpected response content-type: " + contentType);
    }
  }

  // Parse JSON safely
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error("JSON parse error", err, raw);
    throw new Error("Invalid JSON response: " + err.message + " — " + truncate(raw, 300));
  }

  if (data.error) {
    console.error("RPC error", data.error);
    throw new Error("RPC error: " + JSON.stringify(data.error));
  }

  if (!data.result || typeof data.result.value !== "number") {
    console.error("Unexpected RPC response shape", data);
    throw new Error("Unexpected RPC response shape: " + JSON.stringify(data).slice(0, 300));
  }

  return data.result.value;
}
