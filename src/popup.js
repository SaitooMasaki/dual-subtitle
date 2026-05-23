// DualSubtitle popup.js

const CHECKOUT_URL = 'https://saitoomasaki.lemonsqueezy.com/checkout/buy/68d57086-5274-41cf-81de-547082ba6d00';

// ===== Init =====

document.addEventListener('DOMContentLoaded', async () => {
  const data = await storageGet(['enabled', 'targetLang', 'licenseKey', 'licenseStatus']);

  const isPro = data.licenseStatus === 'pro';

  // Toggle
  document.getElementById('toggle').checked = data.enabled !== false;

  // Language selector
  const langSelect = document.getElementById('lang-select');
  langSelect.value = data.targetLang || 'ja';
  langSelect.disabled = !isPro;
  document.getElementById('lang-pro-note').classList.toggle('hidden', isPro);

  // Plan UI
  updatePlanUI(isPro, data.licenseKey || '');

  // Upgrade link
  document.getElementById('upgrade-link').href = CHECKOUT_URL;

  bindEvents(isPro);
});

// ===== Events =====

function bindEvents(isPro) {
  // ON/OFF toggle
  const toggle = document.getElementById('toggle');
  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.storage.sync.set({ enabled });
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.url?.includes('youtube.com/watch')) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_ENABLED', enabled }, () => {
          void chrome.runtime.lastError;
        });
      }
    });
  });

  // Language selection (Pro only)
  document.getElementById('lang-select').addEventListener('change', e => {
    const val = e.target.value;
    storageGet(['licenseStatus']).then(data => {
      if (data.licenseStatus !== 'pro' && val !== 'ja') {
        e.target.value = 'ja';
        return;
      }
      chrome.storage.sync.set({ targetLang: val });
      notifyTargetLangChange(val);
    });
  });

  // License activation
  document.getElementById('btn-activate').addEventListener('click', activateLicense);

  // License removal
  document.getElementById('btn-deactivate').addEventListener('click', deactivateLicense);
}

// ===== License activation =====

async function activateLicense() {
  const key = document.getElementById('license-input').value.trim();
  if (!key) {
    showStatus('Please enter your license key.', 'err');
    return;
  }

  const btn = document.getElementById('btn-activate');
  btn.textContent = 'Checking…';
  btn.disabled = true;

  const { status } = await new Promise(resolve =>
    chrome.runtime.sendMessage({ type: 'VALIDATE_LICENSE', licenseKey: key }, resolve)
  );

  btn.textContent = 'Activate';
  btn.disabled = false;

  if (status === 'pro') {
    updatePlanUI(true, key);
    showStatus('✅ Pro activated! All languages unlocked.', 'ok');
    document.getElementById('lang-select').disabled = false;
    document.getElementById('lang-pro-note').classList.add('hidden');
  } else {
    showStatus('❌ Invalid license key. Please try again.', 'err');
  }
}

async function deactivateLicense() {
  await chrome.storage.sync.set({
    licenseKey:    '',
    licenseStatus: 'free',
    licenseCache:  null,
    targetLang:    'ja',
  });
  document.getElementById('lang-select').value = 'ja';
  document.getElementById('lang-select').disabled = true;
  document.getElementById('lang-pro-note').classList.remove('hidden');
  notifyTargetLangChange('ja');
  updatePlanUI(false, '');
  showStatus('Pro license removed.', 'ok');
}

// ===== UI update =====

function updatePlanUI(isPro, licenseKey) {
  const badge      = document.getElementById('plan-badge');
  const upgradeBar = document.getElementById('upgrade-bar');
  const savedRow   = document.getElementById('key-saved-row');
  const inputRow   = document.getElementById('key-input-row');

  if (isPro) {
    badge.textContent = 'PRO';
    badge.className   = 'badge badge-pro';
    upgradeBar.classList.add('hidden');
    savedRow.classList.remove('hidden');
    inputRow.classList.add('hidden');
  } else {
    badge.textContent = 'Free';
    badge.className   = 'badge badge-free';
    upgradeBar.classList.remove('hidden');
    savedRow.classList.add('hidden');
    inputRow.classList.remove('hidden');
    document.getElementById('license-input').value = '';
  }
}

function showStatus(msg, type) {
  const el = document.getElementById('license-status');
  el.textContent = msg;
  el.className = 'status-msg status-' + type;
  setTimeout(() => { el.textContent = ''; }, 4000);
}

// Notify active YouTube tab of language change
function notifyTargetLangChange(targetLang) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]?.url?.includes('youtube.com/watch')) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_TARGET_LANG', targetLang }, () => {
        void chrome.runtime.lastError;
      });
    }
  });
}

// ===== Utility =====

function storageGet(keys) {
  return new Promise(resolve => chrome.storage.sync.get(keys, resolve));
}
