chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'TRANSLATE') return;

  const url =
    'https://translate.googleapis.com/translate_a/single' +
    '?client=gtx&sl=auto&tl=ja&dt=t' +
    '&q=' + encodeURIComponent(msg.text);

  fetch(url)
    .then(r => r.json())
    .then(data => {
      // レスポンス形式: [[[「訳文」, 「原文」, ...], ...], ...]
      const parts = data[0];
      if (!Array.isArray(parts)) {
        sendResponse({ translation: '' });
        return;
      }
      const translation = parts
        .map(part => part[0] || '')
        .join('');
      sendResponse({ translation });
    })
    .catch(() => sendResponse({ translation: '' }));

  return true;
});
