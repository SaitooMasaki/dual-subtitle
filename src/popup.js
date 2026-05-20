const toggle = document.getElementById('toggle');

// 保存済みの状態を読み込む
chrome.storage.sync.get(['enabled'], result => {
  toggle.checked = result.enabled !== false; // デフォルトON
});

// トグル変更時: 保存 + アクティブなYouTubeタブに通知
toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  chrome.storage.sync.set({ enabled });

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]?.url?.includes('youtube.com/watch')) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_ENABLED', enabled }, () => {
        void chrome.runtime.lastError; // content scriptが未ロードの場合のエラーを無視
      });
    }
  });
});
