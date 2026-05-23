// DualSubtitle background service worker
// 翻訳API中継 + Lemon Squeezy ライセンス認証

const LS_VALIDATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';
const CACHE_HOURS = 24;

// ===== メッセージハンドラ =====

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PING') {
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'TRANSLATE') {
    handleTranslate(msg.text, msg.targetLang || 'ja')
      .then(translation => sendResponse({ translation }))
      .catch(() => sendResponse({ translation: '' }));
    return true;
  }

  if (msg.type === 'VALIDATE_LICENSE') {
    validateLicense(msg.licenseKey)
      .then(status => sendResponse({ status }))
      .catch(() => sendResponse({ status: 'error' }));
    return true;
  }
});

// ===== 翻訳 =====

async function handleTranslate(text, targetLang) {
  const url =
    'https://translate.googleapis.com/translate_a/single' +
    '?client=gtx&sl=auto&tl=' + encodeURIComponent(targetLang) +
    '&dt=t&q=' + encodeURIComponent(text);

  const r = await fetch(url);
  const data = await r.json();
  const parts = data[0];
  if (!Array.isArray(parts)) return '';
  return parts.map(p => p[0] || '').join('');
}

// ===== Lemon Squeezy ライセンス認証 =====

async function validateLicense(licenseKey) {
  if (!licenseKey?.trim()) return 'invalid';

  // キャッシュ確認（24時間以内なら再検証しない）
  const cached = await getCachedStatus(licenseKey);
  if (cached) return cached;

  try {
    const res = await fetch(LS_VALIDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: licenseKey.trim() }),
    });

    if (!res.ok) return 'invalid';
    const data = await res.json();
    const status = data.valid === true ? 'pro' : 'invalid';

    await chrome.storage.sync.set({
      licenseKey:   licenseKey.trim(),
      licenseStatus: status,
      licenseCache: { key: licenseKey.trim(), validatedAt: new Date().toISOString(), status },
    });

    return status;
  } catch {
    // ネットワークエラー時はキャッシュを使用
    const data = await chrome.storage.sync.get(['licenseStatus']);
    return data.licenseStatus ?? 'free';
  }
}

async function getCachedStatus(licenseKey) {
  const data = await chrome.storage.sync.get(['licenseCache']);
  const cache = data.licenseCache;
  if (!cache || cache.key !== licenseKey.trim()) return null;
  const hoursSince = (Date.now() - new Date(cache.validatedAt)) / 3_600_000;
  return hoursSince < CACHE_HOURS ? cache.status : null;
}
