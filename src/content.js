(function () {
  'use strict';

  const SEL_CAPTION_WINDOW = '.ytp-caption-window-container';
  const SEL_CAPTION_SEGMENT = '.ytp-caption-segment';

  // YouTubeのUI文字列パターン（字幕ではなくYouTube自身のメッセージ）
  const YOUTUBE_UI_PATTERNS = [
    /をクリックして設定/,
    /click to enable/i,
    /turn on (captions|subtitles)/i,
    /subtitles\/cc/i,
  ];

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

  function updatePosition() {
    // 動画ページ以外では必ず非表示（SPA遷移後の残留を確実に消す）
    if (location.pathname !== '/watch') {
      hideOverlay();
      return;
    }

    const el = getOverlay();

    const segments = document.querySelectorAll(SEL_CAPTION_SEGMENT);
    if (segments.length > 0) {
      let maxBottom = 0;
      let leftMost = Infinity;
      let rightMost = 0;

      segments.forEach(seg => {
        const r = seg.getBoundingClientRect();
        if (r.bottom > maxBottom) maxBottom = r.bottom;
        if (r.left < leftMost) leftMost = r.left;
        if (r.right > rightMost) rightMost = r.right;
      });

      // 字幕が画面下半分にある場合のみ位置を更新（冒頭の誤配置を防ぐ）
      if (maxBottom > window.innerHeight * 0.5) {
        lastCaptionRect = { bottom: maxBottom, left: leftMost, right: rightMost };
      }
    }

    if (!lastCaptionRect) return;

    const width = lastCaptionRect.right - lastCaptionRect.left;
    el.style.top = (lastCaptionRect.bottom + 4) + 'px';
    el.style.left = lastCaptionRect.left + 'px';
    el.style.width = Math.max(width, 200) + 'px';
  }

  // ---- 翻訳（content scriptから直接fetch） ----

  let targetLang = 'ja';

  // { translation, detectedLang } を返す
  async function translate(text) {
    try {
      const url =
        'https://translate.googleapis.com/translate_a/single' +
        '?client=gtx&sl=auto&tl=' + encodeURIComponent(targetLang) +
        '&dt=t&q=' + encodeURIComponent(text);
      const r = await fetch(url);
      const data = await r.json();
      const parts = data[0];
      if (!Array.isArray(parts)) return { translation: '', detectedLang: '' };
      const translation = parts.map(p => p[0] || '').join('');
      const detectedLang = data[2] || '';
      return { translation, detectedLang };
    } catch {
      return { translation: '', detectedLang: '' };
    }
  }

  function showTranslation(translation) {
    const el = getOverlay();
    el.textContent = translation;
    el.style.display = 'block';
    updatePosition();
  }

  function hideOverlay() {
    const el = getOverlay();
    el.textContent = '';
    el.style.display = 'none';
  }

  function onCaptionText(text) {
    if (!enabled || !text.trim()) {
      hideOverlay();
      return;
    }

    // YouTubeのUI文字列は無視
    if (YOUTUBE_UI_PATTERNS.some(p => p.test(text))) {
      hideOverlay();
      return;
    }

    if (text === lastText) return;
    lastText = text;

    // キャッシュヒット → 即表示
    const cached = getCached(text);
    if (cached !== null) {
      clearTimeout(translateTimer);
      showTranslation(cached);
      return;
    }

    // 25ms debounce：連続更新をまとめてから1回だけfetch
    clearTimeout(translateTimer);
    translateTimer = setTimeout(async () => {
      const { translation, detectedLang } = await translate(text);
      if (!translation) return;
      // ソース言語 = ターゲット言語のとき（日本語動画×日本語翻訳など）は非表示
      if (detectedLang && detectedLang === targetLang) {
        hideOverlay();
        return;
      }
      setCache(text, translation);
      if (lastText === text) showTranslation(translation);
    }, 25);
  }

  // ---- YouTube字幕の監視 ----

  function watchCaptions() {
    const container = document.querySelector(SEL_CAPTION_WINDOW);
    if (!container || captionObserver) return;

    // 字幕コンテナ検出時点でTCP接続を事前確立（最初の翻訳ラグを削減）
    fetch(
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
      encodeURIComponent(targetLang) + '&dt=t&q=hi'
    ).catch(() => {});

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

  function setup() {
    if (captionObserver) {
      captionObserver.disconnect();
      captionObserver = null;
    }
    lastText = '';
    lastCaptionRect = null;
    hideOverlay();

    const retry = setInterval(() => {
      if (document.querySelector(SEL_CAPTION_WINDOW)) {
        watchCaptions();
        clearInterval(retry);
      }
    }, 500);

    setTimeout(() => clearInterval(retry), 30000);
  }

  function startPositionLoop() {
    clearInterval(positionTimer);
    positionTimer = setInterval(updatePosition, 500);
  }

  // ---- YouTube SPAナビゲーション対応 ----

  let currentUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      if (location.pathname === '/watch') {
        // 動画ページへ移動 → 字幕監視を再セットアップ
        setTimeout(setup, 1500);
      } else {
        // 動画ページから離れた（ホーム等）→ クリーンアップ
        clearTimeout(translateTimer);
        lastText = ''; // 進行中のfetchが完了しても表示されないようにする
        hideOverlay();
        if (captionObserver) {
          captionObserver.disconnect();
          captionObserver = null;
        }
      }
    }
  }).observe(document.documentElement, { subtree: true, childList: true });

  // ---- Popupからのメッセージ ----

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'SET_ENABLED') {
      enabled = msg.enabled;
      if (!enabled) {
        clearTimeout(translateTimer); // 進行中のタイマーを止めて再表示を防ぐ
        hideOverlay();
      }
    }
    if (msg.type === 'SET_TARGET_LANG') {
      targetLang = msg.targetLang || 'ja';
      translationCache.clear();
      lastText = '';
    }
  });

  // ---- 初期化 ----

  chrome.storage.sync.get(['enabled', 'targetLang'], result => {
    enabled    = result.enabled !== false;
    targetLang = result.targetLang || 'ja';
    setup();
    startPositionLoop();
  });
})();
