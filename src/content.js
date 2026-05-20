(function () {
  'use strict';

  const SEL_CAPTION_WINDOW = '.ytp-caption-window-container';
  const SEL_CAPTION_SEGMENT = '.ytp-caption-segment';

  let overlay = null;
  let enabled = true;
  let lastText = '';
  let translateTimer = null;
  let positionTimer = null;
  let captionObserver = null;
  let lastCaptionRect = null;

  // 翻訳キャッシュ（同じ字幕テキストは即返す）
  const translationCache = new Map();
  const MAX_CACHE = 300;

  function getCached(text) {
    return translationCache.get(text) ?? null;
  }

  function setCache(text, translation) {
    if (translationCache.size >= MAX_CACHE) {
      translationCache.delete(translationCache.keys().next().value);
    }
    translationCache.set(text, translation);
  }

  // ---- オーバーレイ管理 ----

  function createOverlay() {
    const el = document.createElement('div');
    el.id = 'ds-overlay';
    document.body.appendChild(el);
    return el;
  }

  function getOverlay() {
    if (!overlay || !document.body.contains(overlay)) {
      overlay = createOverlay();
    }
    return overlay;
  }

  // 字幕テキスト要素の実際の座標を使って位置を決める
  function updatePosition() {
    const el = getOverlay();

    // 現在表示中の字幕セグメントを探す
    const segments = document.querySelectorAll(SEL_CAPTION_SEGMENT);
    if (segments.length > 0) {
      // 最も下にある行のbottomを基準にする
      let maxBottom = 0;
      let leftMost = Infinity;
      let rightMost = 0;

      segments.forEach(seg => {
        const r = seg.getBoundingClientRect();
        if (r.bottom > maxBottom) maxBottom = r.bottom;
        if (r.left < leftMost) leftMost = r.left;
        if (r.right > rightMost) rightMost = r.right;
      });

      lastCaptionRect = { bottom: maxBottom, left: leftMost, right: rightMost };
    }

    if (!lastCaptionRect) return;

    const width = lastCaptionRect.right - lastCaptionRect.left;
    el.style.top = (lastCaptionRect.bottom + 4) + 'px';
    el.style.left = lastCaptionRect.left + 'px';
    el.style.width = Math.max(width, 200) + 'px';
  }

  // ---- 翻訳 ----

  function translate(text) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'TRANSLATE', text }, response => {
        resolve(response?.translation || '');
      });
    });
  }

  function showTranslation(translation) {
    const el = getOverlay();
    el.textContent = translation;
    updatePosition();
  }

  function onCaptionText(text) {
    if (!enabled || !text.trim()) {
      getOverlay().textContent = '';
      return;
    }
    if (text === lastText) return;
    lastText = text;

    // キャッシュヒット → 即表示（ラグゼロ）
    const cached = getCached(text);
    if (cached !== null) {
      clearTimeout(translateTimer);
      showTranslation(cached);
      return;
    }

    // キャッシュミス → 100ms待ってAPIへ（連続更新の途中で無駄に呼ばない）
    clearTimeout(translateTimer);
    translateTimer = setTimeout(async () => {
      const translation = await translate(text);
      if (!translation) return;
      setCache(text, translation);
      // テキストが変わっていなければ表示（古い結果を上書きしない）
      if (lastText === text) showTranslation(translation);
    }, 100);
  }

  // ---- YouTube字幕の監視 ----

  function watchCaptions() {
    const container = document.querySelector(SEL_CAPTION_WINDOW);
    if (!container || captionObserver) return;

    captionObserver = new MutationObserver(() => {
      const segments = container.querySelectorAll(SEL_CAPTION_SEGMENT);
      const text = [...segments].map(s => s.textContent).join('');
      onCaptionText(text);
    });

    captionObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // 字幕コンテナが現れるまでリトライ
  function setup() {
    if (captionObserver) {
      captionObserver.disconnect();
      captionObserver = null;
    }
    lastText = '';
    lastCaptionRect = null;
    getOverlay().textContent = '';

    const retry = setInterval(() => {
      if (document.querySelector(SEL_CAPTION_WINDOW)) {
        watchCaptions();
        clearInterval(retry);
      }
    }, 500);

    // 30秒でタイムアウト
    setTimeout(() => clearInterval(retry), 30000);
  }

  // フルスクリーン・リサイズ対応
  function startPositionLoop() {
    clearInterval(positionTimer);
    positionTimer = setInterval(updatePosition, 500);
  }

  // ---- YouTube SPAナビゲーション対応 ----

  let currentUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      // 動画ページへの遷移のみsetup実行
      if (location.pathname === '/watch') {
        setTimeout(setup, 1500);
      }
    }
  }).observe(document.documentElement, { subtree: true, childList: true });

  // ---- Popupからのメッセージ ----

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'SET_ENABLED') {
      enabled = msg.enabled;
      if (!enabled) getOverlay().textContent = '';
    }
  });

  // ---- 初期化 ----

  chrome.storage.sync.get(['enabled'], result => {
    enabled = result.enabled !== false; // デフォルトON
    setup();
    startPositionLoop();
  });
})();
