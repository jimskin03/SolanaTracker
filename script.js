document.addEventListener('DOMContentLoaded', function () {
    const checkButton = document.getElementById('checkBalance');
    const walletInput = document.getElementById('walletAddress');
    const balanceDisplay = document.getElementById('balanceAmount');
    const errorMessage = document.getElementById('errorMessage');

    function validateAddress(address) {
        // Base58 Solana address (typically 32–44 chars)
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    }

    function formatBalance(sol) {
        if (typeof sol !== 'number' || Number.isNaN(sol)) {
            return '0';
        }
        // Show up to 9 decimals, trim trailing zeros
        return sol.toFixed(9).replace(/\.?0+$/, '');
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.hidden = false;
    }

    function clearError() {
        errorMessage.textContent = '';
        errorMessage.hidden = true;
    }

    async function fetchBalance() {
        const address = walletInput.value.trim();

        if (!address) {
            showError('Please enter a Solana wallet address');
            return;
        }

        if (!validateAddress(address)) {
            showError('Invalid Solana address format');
            return;
        }

        clearError();
        balanceDisplay.textContent = 'Loading...';
        checkButton.disabled = true;

        try {
            // Local proxy avoids browser CORS issues with public Solana RPCs
            const response = await fetch('/api/balance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ address: address })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || ('HTTP ' + response.status));
            }

            balanceDisplay.textContent = formatBalance(data.sol);
        } catch (error) {
            balanceDisplay.textContent = '—';
            const msg = error && error.message ? error.message : String(error);
            if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
                showError(
                    'Cannot reach local server. Run: python server.py then open http://127.0.0.1:5500'
                );
            } else {
                showError('Error fetching balance: ' + msg);
            }
        } finally {
            checkButton.disabled = false;
        }
    }

    checkButton.addEventListener('click', fetchBalance);

    walletInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            fetchBalance();
        }
    });
});
