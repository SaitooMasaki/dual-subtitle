// DualSubtitle popup.js — Pro 対応版

const CHECKOUT_URL = 'https://saitoomasaki.lemonsqueezy.com/checkout/buy/DUAL_SUBTITLE_PRODUCT_ID'; // TODO: 更新

// ===== 初期化 =====

document.addEventListener('DOMContentLoaded', async () => {
  const data = await storageGet(['enabled', 'targetLang', 'licenseKey', 'licenseStatus']);

  const isPro = data.licenseStatus === 'pro';

  // トグル
  document.getElementById('toggle').checked = data.enabled !== false;

  // 言語セレクター
  const langSelect = document.getElementById('lang-select');
  langSelect.value = data.targetLang || 'ja';
  langSelect.disabled = !isPro;
  document.getElementById('lang-pro-note').classList.toggle('hidden', isPro);

  // プラン UI
  updatePlanUI(isPro, data.licenseKey || '');

  // アップグレードリンク
  document.getElementById('upgrade-link').href = CHECKOUT_URL;

  bindEvents(isPro);
});

// ===== イベント =====

function bindEvents(isPro) {
  // ON/OFF トグル
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

  // 言語選択（Pro のみ）
  document.getElementById('lang-select').addEventListener('change', e => {
    const val = e.target.value;
    // Free ユーザーが日本語以外を選んでいたらリセット
    storageGet(['licenseStatus']).then(data => {
      if (data.licenseStatus !== 'pro' && val !== 'ja') {
        e.target.value = 'ja';
        return;
      }
      chrome.storage.sync.set({ targetLang: val });
      notifyTargetLangChange(val);
    });
  });

  // ライセンス認証
  document.getElementById('btn-activate').addEventListener('click', activateLicense);

  // ライセンス解除
  document.getElementById('btn-deactivate').addEventListener('click', deactivateLicense);
}

// ===== ライセンス認証 =====

async function activateLicense() {
  const key = document.getElementById('license-input').value.trim();
  if (!key) {
    showStatus('ライセンスキーを入力してください', 'err');
    return;
  }

  const btn = document.getElementById('btn-activate');
  btn.textContent = '確認中…';
  btn.disabled = true;

  const { status } = await new Promise(resolve =>
    chrome.runtime.sendMessage({ type: 'VALIDATE_LICENSE', licenseKey: key }, resolve)
  );

  btn.textContent = '認証';
  btn.disabled = false;

  if (status === 'pro') {
    updatePlanUI(true, key);
    showStatus('✅ Pro が有効になりました', 'ok');
    // 言語セレクターを解放
    document.getElementById('lang-select').disabled = false;
    document.getElementById('lang-pro-note').classList.add('hidden');
  } else {
    showStatus('❌ 無効なライセンスキーです', 'err');
  }
}

async function deactivateLicense() {
  await chrome.storage.sync.set({
    licenseKey:    '',
    licenseStatus: 'free',
    licenseCache:  null,
    targetLang:    'ja',
  });
  // 言語を日本語に戻す
  document.getElementById('lang-select').value = 'ja';
  document.getElementById('lang-select').disabled = true;
  document.getElementById('lang-pro-note').classList.remove('hidden');
  notifyTargetLangChange('ja');
  updatePlanUI(false, '');
  showStatus('Pro を解除しました', 'ok');
}

// ===== UI 更新 =====

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

// アクティブなYouTubeタブに言語変更を通知
function notifyTargetLangChange(targetLang) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]?.url?.includes('youtube.com/watch')) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_TARGET_LANG', targetLang }, () => {
        void chrome.runtime.lastError;
      });
    }
  });
}

// ===== ユーティリティ =====

function storageGet(keys) {
  return new Promise(resolve => chrome.storage.sync.get(keys, resolve));
}
