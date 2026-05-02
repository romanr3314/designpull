const DEFAULT_MODELS = {
  Gemini: 'gemini-2.0-flash',
  OpenAI: 'gpt-4o',
  Claude: 'claude-sonnet-4-20250514',
  Ollama: 'llama3'
};

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const screenSettings = document.getElementById('settings-screen');
  const screenMain = document.getElementById('main-screen');
  const screenHistory = document.getElementById('history-screen');

  const btnBack = document.getElementById('back-btn');
  const btnHistory = document.getElementById('open-history');
  const btnBackHistory = document.getElementById('back-history-btn');
  const btnClearHistory = document.getElementById('clear-history');
  const btnSettings = document.getElementById('open-settings');
  const btnSaveSettings = document.getElementById('save-settings');
  const btnGenerate = document.getElementById('generate-btn');
  const btnGenerateText = document.getElementById('generate-btn-text');
  const btnCopy = document.getElementById('copy-btn');
  const btnCopyText = document.getElementById('copy-btn-text');
  const btnDownload = document.getElementById('download-btn');
  const btnFetchModels = document.getElementById('fetch-models');
  const btnFetchModelsText = document.getElementById('fetch-models-text');
  const btnToggleKeyVis = document.getElementById('toggle-key-vis');

  const inputProvider = document.getElementById('provider');
  const inputModel = document.getElementById('model');
  const inputModelCustom = document.getElementById('model-custom');
  const inputApiKey = document.getElementById('api-key');
  const inputBaseUrl = document.getElementById('base-url');
  const inputCaptureMode = document.getElementById('capture-mode');

  const containerApiKey = document.getElementById('api-key-container');
  const containerBaseUrl = document.getElementById('base-url-container');

  const elCurrentProvider = document.getElementById('current-provider');
  const elCurrentModel = document.getElementById('current-model');
  const elLoading = document.getElementById('loading-container');
  const elLoadingText = document.getElementById('loading-text');
  const elOutputContainer = document.getElementById('output-container');
  const elOutput = document.getElementById('output');
  const elHistoryList = document.getElementById('history-list');

  let currentGenerationInfo = null;

  // --- Toast System --- //
  const elToast = document.getElementById('toast');
  let toastTimeout = null;

  function showToast(message, type = 'info') {
    clearTimeout(toastTimeout);
    elToast.textContent = message;
    elToast.className = 'toast ' + type;
    requestAnimationFrame(() => elToast.classList.add('visible'));
    toastTimeout = setTimeout(() => elToast.classList.remove('visible'), 3000);
  }

  // --- Initialization --- //

  chrome.storage.local.get(['provider', 'model', 'apiKey', 'baseUrl', 'captureMode'], (data) => {
    const provider = data.provider || 'Gemini';
    inputProvider.value = provider;
    inputApiKey.value = data.apiKey || '';
    inputBaseUrl.value = data.baseUrl || 'http://localhost:11434';
    if (inputCaptureMode) {
      inputCaptureMode.value = data.captureMode || 'full';
    }

    // Set the default model in the dropdown
    populateModelDropdown([data.model || DEFAULT_MODELS[provider]]);
    inputModel.value = data.model || DEFAULT_MODELS[provider];

    updateHeader(provider, inputModel.value);
    toggleProviderFields(provider);
  });

  // --- Event Listeners --- //

  // Settings: Provider dropdown change
  inputProvider.addEventListener('change', (e) => {
    const provider = e.target.value;
    const defaultModel = DEFAULT_MODELS[provider];
    populateModelDropdown([defaultModel]);
    inputModel.value = defaultModel;
    inputModelCustom.value = '';
    toggleProviderFields(provider);
  });

  // Settings: Toggle API key visibility
  btnToggleKeyVis.addEventListener('click', () => {
    const isPassword = inputApiKey.type === 'password';
    inputApiKey.type = isPassword ? 'text' : 'password';
  });

  // Settings: Fetch Models — dynamic per provider
  btnFetchModels.addEventListener('click', async () => {
    const provider = inputProvider.value;
    const apiKey = inputApiKey.value;
    const baseUrl = inputBaseUrl.value;

    if (provider !== 'Ollama' && !apiKey) {
      showToast(`Enter your ${provider} API key first`, 'error');
      return;
    }

    try {
      btnFetchModels.classList.add('loading');
      btnFetchModelsText.textContent = 'Fetching…';
      let models = [];

      if (provider === 'Gemini') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!res.ok) throw new Error('Invalid API key or network error');
        const data = await res.json();
        models = data.models
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => m.name.replace('models/', ''))
          .sort();

      } else if (provider === 'OpenAI') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!res.ok) throw new Error('Invalid API key');
        const data = await res.json();
        models = data.data
          .map(m => m.id)
          .filter(id => /^(gpt-|o[1-9]|chatgpt-)/.test(id))
          .sort();

      } else if (provider === 'Claude') {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          }
        });
        if (!res.ok) throw new Error('Invalid API key or access denied');
        const data = await res.json();
        if (data.data && Array.isArray(data.data)) {
          models = data.data.map(m => m.id).sort();
        } else {
          // Fallback to known models if the list endpoint doesn't work
          models = [
            'claude-sonnet-4-20250514',
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
            'claude-3-opus-20240229',
            'claude-3-haiku-20240307'
          ];
        }

      } else if (provider === 'Ollama') {
        const endpoint = `${baseUrl.replace(/\/$/, '')}/api/tags`;
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error('Cannot connect to Ollama. Is it running?');
        const data = await res.json();
        models = (data.models || []).map(m => m.name).sort();
      }

      if (models.length > 0) {
        populateModelDropdown(models);
        inputModel.value = models[0];
        showToast(`Found ${models.length} models`, 'success');
      } else {
        showToast('No models found for this provider', 'error');
      }

    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnFetchModels.classList.remove('loading');
      btnFetchModelsText.textContent = 'Fetch Models';
    }
  });

  // Navigation
  btnSettings.addEventListener('click', () => {
    screenMain.classList.add('hidden');
    screenSettings.classList.remove('hidden');
  });

  btnBack.addEventListener('click', () => {
    screenSettings.classList.add('hidden');
    screenMain.classList.remove('hidden');
  });

  btnHistory.addEventListener('click', () => {
    screenMain.classList.add('hidden');
    screenHistory.classList.remove('hidden');
    renderHistory();
  });

  btnBackHistory.addEventListener('click', () => {
    screenHistory.classList.add('hidden');
    screenMain.classList.remove('hidden');
  });

  btnClearHistory.addEventListener('click', () => {
    chrome.storage.local.set({ designHistory: [] }, () => {
      renderHistory();
      showToast('History cleared', 'success');
    });
  });

  // Save settings
  btnSaveSettings.addEventListener('click', () => {
    const selectedModel = inputModelCustom.value.trim() || inputModel.value;
    const config = {
      provider: inputProvider.value,
      model: selectedModel,
      apiKey: inputApiKey.value,
      baseUrl: inputBaseUrl.value,
      captureMode: inputCaptureMode ? inputCaptureMode.value : 'full'
    };
    chrome.storage.local.set(config, () => {
      updateHeader(config.provider, config.model);
      screenSettings.classList.add('hidden');
      screenMain.classList.remove('hidden');
      showToast('Settings saved', 'success');
    });
  });

  // Actions: Copy markdown
  btnCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(elOutput.value).then(() => {
      btnCopy.classList.add('copied');
      btnCopyText.textContent = 'Copied!';
      showToast('Copied to clipboard', 'success');
      setTimeout(() => {
        btnCopy.classList.remove('copied');
        btnCopyText.textContent = 'Copy';
      }, 2000);
    });
  });

  // Actions: Download markdown
  btnDownload.addEventListener('click', () => {
    const blob = new Blob([elOutput.value], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'design.md';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloading design.md', 'success');
  });

  // Actions: Extract & Generate
  btnGenerate.addEventListener('click', async () => {
    elOutput.value = '';
    elOutputContainer.classList.add('hidden');
    btnGenerate.classList.add('hidden');
    elLoading.classList.remove('hidden');
    elLoadingText.textContent = 'Extracting DOM styles…';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active tab found.');

      currentGenerationInfo = {
        title: tab.title,
        url: tab.url,
        timestamp: Date.now()
      };

      const data = await chrome.storage.local.get(['provider', 'model', 'apiKey', 'baseUrl', 'captureMode']);
      const captureMode = data.captureMode || 'full';

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (mode) => { window.__designpullCaptureMode = mode; },
        args: [captureMode]
      });

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lib/extractor.js']
      });

      const tokens = results[0]?.result;
      if (!tokens) throw new Error('Failed to extract tokens from the page.');

      let screenshotBase64 = null;
      try {
        if (captureMode === 'view') {
          elLoadingText.textContent = 'Capturing current view…';
          screenshotBase64 = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 85 });
        } else {
          elLoadingText.textContent = 'Capturing full page screenshot…';
          screenshotBase64 = await captureFullPageScreenshot(tab.id);
        }
      } catch (err) {
        console.warn('Screenshot failed:', err);
      }

      elLoadingText.textContent = 'Sending to AI…';

      chrome.runtime.sendMessage({
        type: 'GENERATE',
        provider: data.provider || 'Gemini',
        model: data.model || DEFAULT_MODELS['Gemini'],
        apiKey: data.apiKey,
        baseUrl: data.baseUrl,
        tokens: tokens,
        screenshotBase64: screenshotBase64
      });

      elOutputContainer.classList.remove('hidden');

    } catch (err) {
      resetUI();
      showToast(err.message, 'error');
    }
  });

  // Listen for background worker messages
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'CHUNK') {
      elLoading.classList.add('hidden');
      elOutput.value += msg.text;
      elOutput.scrollTop = elOutput.scrollHeight;
    } else if (msg.type === 'DONE') {
      resetUI();
      btnGenerateText.textContent = 'Regenerate';
      showToast('design.md generated successfully', 'success');

      if (currentGenerationInfo) {
        saveToHistory({
          ...currentGenerationInfo,
          markdown: elOutput.value
        });
      }
    } else if (msg.type === 'ERROR') {
      resetUI();
      elOutputContainer.classList.add('hidden');
      showToast(msg.message, 'error');
    }
  });

  // --- Helper Functions --- //

  function toggleProviderFields(provider) {
    if (provider === 'Ollama') {
      containerApiKey.classList.add('hidden');
      containerBaseUrl.classList.remove('hidden');
    } else {
      containerApiKey.classList.remove('hidden');
      containerBaseUrl.classList.add('hidden');
    }
  }

  function updateHeader(provider, model) {
    elCurrentProvider.textContent = provider;
    elCurrentModel.textContent = model;
  }

  function populateModelDropdown(models) {
    inputModel.innerHTML = '';
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      inputModel.appendChild(opt);
    });
  }

  function resetUI() {
    elLoading.classList.add('hidden');
    btnGenerate.classList.remove('hidden');
  }

  // --- History System --- //
  function renderHistory() {
    chrome.storage.local.get(['designHistory'], (data) => {
      const history = data.designHistory || [];
      elHistoryList.innerHTML = '';
      
      if (history.length === 0) {
        elHistoryList.innerHTML = '<div class="history-empty">No history yet</div>';
        return;
      }
      
      history.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
          <div class="history-item-header">
            <span class="history-item-title">${escapeHTML(item.title || 'Unknown Page')}</span>
            <span class="history-item-date">${new Date(item.timestamp).toLocaleDateString()}</span>
          </div>
          <div class="history-item-url">${escapeHTML(item.url || '')}</div>
        `;
        div.addEventListener('click', () => {
          elOutput.value = item.markdown;
          elOutputContainer.classList.remove('hidden');
          screenHistory.classList.add('hidden');
          screenMain.classList.remove('hidden');
        });
        elHistoryList.appendChild(div);
      });
    });
  }

  function saveToHistory(item) {
    chrome.storage.local.get(['designHistory'], (data) => {
      let history = data.designHistory || [];
      history.unshift(item);
      if (history.length > 20) history = history.slice(0, 20);
      chrome.storage.local.set({ designHistory: history });
    });
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;'
        }[tag] || tag)
    );
  }

  // --- Screenshot Stitching Logic --- //
  async function captureFullPageScreenshot(tabId) {
    try {
      const [dimResult] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          return {
            scrollHeight: document.documentElement.scrollHeight,
            clientHeight: window.innerHeight,
            clientWidth: document.documentElement.clientWidth,
            devicePixelRatio: window.devicePixelRatio || 1
          };
        }
      });

      if (!dimResult || !dimResult.result) throw new Error('Could not get page dimensions');
      const { scrollHeight, clientHeight, clientWidth, devicePixelRatio } = dimResult.result;

      if (scrollHeight <= clientHeight) {
        return await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 85 });
      }

      const maxSteps = 10;
      const numSteps = Math.min(Math.ceil(scrollHeight / clientHeight), maxSteps);
      const captures = [];

      const [initialScroll] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({ x: window.scrollX, y: window.scrollY })
      });

      for (let i = 0; i < numSteps; i++) {
        const yOffset = i === numSteps - 1 ? scrollHeight - clientHeight : i * clientHeight;

        await chrome.scripting.executeScript({
          target: { tabId },
          func: (y) => window.scrollTo(0, y),
          args: [yOffset]
        });

        await new Promise(r => setTimeout(r, 300));

        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 100 });
        captures.push({ dataUrl, yOffset });
      }

      await chrome.scripting.executeScript({
        target: { tabId },
        func: (pos) => window.scrollTo(pos.x, pos.y),
        args: [initialScroll.result]
      });

      const canvas = new OffscreenCanvas(
        clientWidth * devicePixelRatio,
        Math.min(scrollHeight, clientHeight * maxSteps) * devicePixelRatio
      );
      const ctx = canvas.getContext('2d');

      for (let i = 0; i < captures.length; i++) {
        const cap = captures[i];
        const imgBlob = await fetch(cap.dataUrl).then(r => r.blob());
        const imgBitmap = await createImageBitmap(imgBlob);
        const drawY = cap.yOffset * devicePixelRatio;
        ctx.drawImage(imgBitmap, 0, drawY);
      }

      const MAX_DIM = 2000;
      let finalCanvas = canvas;
      if (canvas.width > MAX_DIM || canvas.height > MAX_DIM) {
        const scale = MAX_DIM / Math.max(canvas.width, canvas.height);
        finalCanvas = new OffscreenCanvas(canvas.width * scale, canvas.height * scale);
        const scaledCtx = finalCanvas.getContext('2d');
        scaledCtx.drawImage(canvas, 0, 0, finalCanvas.width, finalCanvas.height);
      }

      const finalBlob = await finalCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(finalBlob);
      });

    } catch (error) {
      console.warn('Full page capture failed, falling back to viewport capture.', error);
      return await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 85 }).catch(() => null);
    }
  }
});
