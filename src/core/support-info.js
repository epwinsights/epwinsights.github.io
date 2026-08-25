/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import QRCode from 'qrcode';

const donationWallets = [
  {
    id: 'eth',
    label: 'Ethereum',
    ticker: 'ETH',
    network: 'Ethereum Mainnet (ERC-20)',
    icon: 'bi-currency-exchange',
    address: '0xCeC03701689db92e9cE4fcFda6FAEFC9E372181c',
    note: 'Send this using the Ethereum network in your wallet app. Most apps select this automatically for ETH.'
  },
  {
    id: 'btc',
    label: 'Bitcoin',
    ticker: 'BTC',
    network: 'Bitcoin (Legacy)',
    icon: 'bi-currency-bitcoin',
    address: '1HvXsPCuftCcCnBwMFf5WHiTqvwZHB4Gud',
    note: 'Send this using the Bitcoin network in your wallet app. It is the default network for BTC.'
  },
  {
    id: 'sol',
    label: 'Solana',
    ticker: 'SOL',
    network: 'Solana Mainnet',
    icon: 'bi-sun',
    address: 'J2pbmXJC8xq9iw1hEzz8LUCcTjR2f975DBQdWhX779wT',
    note: 'Choose the Solana network when sending this. Most wallets automatically use it for SOL transfers.'
  },
  {
    id: 'trx',
    label: 'Tron',
    ticker: 'TRX',
    network: 'TRON (TRC20)',
    icon: 'bi-lightning-charge',
    address: 'TTY9CP7VoEMbTtp8WPN4SvCv8FaaXPHZ91',
    note: 'Send this using the TRON network in your wallet app. This is the standard default option for TRX.'
  },
  {
    id: 'usdt',
    label: 'Tether (USDT)',
    ticker: 'USDT',
    network: 'Base',
    icon: 'bi-currency-dollar',
    address: '0xCeC03701689db92e9cE4fcFda6FAEFC9E372181c',
    note: 'When sending, pick "Base" as the network. Most apps let you choose it from a short list right before you confirm.'
  }
];

function buildNavItemHTML(wallet, isActive) {
  return `
    <li class="nav-item" role="presentation">
      <button class="nav-link ${isActive ? 'active' : ''}" id="support-tab-${wallet.id}"
              data-bs-toggle="pill" data-bs-target="#support-pane-${wallet.id}"
              type="button" role="tab" aria-controls="support-pane-${wallet.id}">
        <i class="bi ${wallet.icon} me-1"></i>${wallet.ticker}
      </button>
    </li>`;
}

function buildPaneHTML(wallet, isActive) {
  return `
    <div class="tab-pane fade ${isActive ? 'show active' : ''}" id="support-pane-${wallet.id}"
         role="tabpanel" aria-labelledby="support-tab-${wallet.id}">
      <div class="support-wallet-panel">
        <div class="support-qr-box">
          <canvas id="support-qr-${wallet.id}" width="176" height="176"></canvas>
        </div>
        <div class="support-wallet-details">
          <span class="support-network-badge">
            <i class="bi bi-diagram-3 me-1"></i>${wallet.network}
          </span>
          <label class="form-label small text-muted mb-1" for="support-address-${wallet.id}">
            ${wallet.label} (${wallet.ticker}) address
          </label>
          <div class="input-group input-group-sm support-address-group">
            <input type="text" class="form-control font-monospace support-address-input"
                   id="support-address-${wallet.id}" value="${wallet.address}" readonly>
            <button class="btn btn-outline-secondary support-copy-btn" type="button"
                    data-address="${wallet.address}" title="Copy address">
              <i class="bi bi-clipboard"></i>
            </button>
          </div>
          <p class="support-note mb-0">
            <i class="bi bi-info-circle me-1"></i>${wallet.note}
          </p>
        </div>
      </div>
    </div>`;
}

export function initSupportModal() {
  const modalBody = document.getElementById('support-modal-body');
  if (!modalBody) return;

  const navHTML = donationWallets.map((w, i) => buildNavItemHTML(w, i === 0)).join('');
  const panesHTML = donationWallets.map((w, i) => buildPaneHTML(w, i === 0)).join('');

  modalBody.innerHTML = `
    <p class="support-intro">
      EPW Insights is free, open-source, and has no backend or subscription, but it isn't free to build and maintain.
      If it has been useful for your work, a small crypto donation helps support continued development.
      There is no processor or middleman involved: donations go directly, on-chain, to the address you choose below.
    </p>
    <ul class="nav nav-pills support-wallet-tabs mb-3" id="support-wallet-tabs" role="tablist">
      ${navHTML}
    </ul>
    <div class="tab-content" id="support-wallet-panes">
      ${panesHTML}
    </div>
    <div class="support-disclaimer">
      <i class="bi bi-info-circle me-1"></i>
      No need to be a crypto expert. Just use the network shown under each address, which your wallet app will usually suggest by default anyway.
    </div>
  `;

  renderQrCodes();
  wireCopyButtons(modalBody);
}

function renderQrCodes() {
  donationWallets.forEach((wallet) => {
    const canvas = document.getElementById(`support-qr-${wallet.id}`);
    if (!canvas) return;
    QRCode.toCanvas(canvas, wallet.address, {
      width: 176,
      margin: 1,
      color: { dark: '#1e293b', light: '#ffffff' }
    }).catch((err) => console.error('EPW Insights: QR code generation failed for', wallet.id, err));
  });
}

function wireCopyButtons(container) {
  container.querySelectorAll('.support-copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const address = btn.dataset.address;
      try {
        await navigator.clipboard.writeText(address);
        flashCopied(btn);
      } catch (err) {
        const input = btn.closest('.input-group')?.querySelector('.support-address-input');
        if (input) {
          input.select();
          input.setSelectionRange(0, address.length);
        }
      }
    });
  });
}

function flashCopied(btn) {
  const icon = btn.querySelector('i');
  const originalClass = icon.className;
  icon.className = 'bi bi-check2';
  btn.classList.add('support-copy-btn-success');
  setTimeout(() => {
    icon.className = originalClass;
    btn.classList.remove('support-copy-btn-success');
  }, 1500);
}