# server.py
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests
import logging
import os

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app, origins="*")
logging.basicConfig(level=logging.INFO)

# Prioritized RPC endpoints. You can set SOLANA_RPC env to override first entry.
RPC_ENDPOINTS = [
    os.environ.get("SOLANA_RPC", "https://public-rpc.solana.com"),
    "https://api.mainnet-beta.solana.com"
]

@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/api/balance", methods=["POST"])
def api_balance():
    try:
        data = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    address = (data or {}).get("address")
    if not address:
        return jsonify({"error": "Missing address"}), 400

    payload = {"jsonrpc": "2.0", "id": 1, "method": "getBalance", "params": [address]}

    last_err = None
    for rpc in RPC_ENDPOINTS:
        logging.info("Proxying getBalance for %s -> %s", address, rpc)
        try:
            r = requests.post(rpc, json=payload, timeout=10)
        except requests.RequestException as e:
            logging.warning("Request to %s failed: %s", rpc, e)
            last_err = str(e)
            continue

        logging.info("Upstream %s responded with %s", rpc, r.status_code)
        # Try to parse JSON result
        try:
            jr = r.json()
        except ValueError:
            jr = None

        # If the upstream returned HTTP 403, log full body and continue
        if r.status_code == 403 or (jr and jr.get("error", {}).get("code") == 403):
            logging.warning("Upstream %s returned 403: %s", rpc, jr or r.text)
            last_err = jr or r.text
            continue

        if r.ok and jr:
            # JSON-RPC result present?
            if "result" in jr:
                lamports = jr["result"].get("value", 0)
                sol = lamports / 1e9
                return jsonify({"sol": sol})
            # Upstream returned JSON-RPC error (non-403): propagate message
            if "error" in jr:
                logging.warning("Upstream %s returned error: %s", rpc, jr["error"])
                last_err = jr["error"]
                # try next endpoint before giving up
                continue

        # Non-OK status; record message and try next
        last_err = jr or r.text

    # If we reach here, all RPC attempts failed
    logging.error("All RPC endpoints failed: %s", last_err)
    return jsonify({"error": "Upstream RPCs failed", "details": last_err}), 502

if __name__ == "__main__":
    # Run on port 5500 by default
    port = int(os.environ.get("PORT", 5500))
    app.run(host="127.0.0.1", port=port, debug=False)
