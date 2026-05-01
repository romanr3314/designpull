import { callAI } from './lib/adapter.js';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GENERATE") {
    // We handle the work asynchronously to prevent blocking the service worker
    handleGenerateProcess(request);
    
    // Return true to indicate we might respond asynchronously,
    // though for streaming we will use chrome.runtime.sendMessage
    return true;
  }
});

async function handleGenerateProcess(request) {
  const { provider, apiKey, model, baseUrl, tokens, screenshotBase64 } = request;

  try {
    const result = await callAI({ provider, apiKey, model, baseUrl, tokens, screenshotBase64 });

    // Check if the adapter returned an async generator/iterable (streaming supported)
    if (result && typeof result[Symbol.asyncIterator] === 'function') {
      for await (const chunk of result) {
        chrome.runtime.sendMessage({
          type: "CHUNK",
          text: chunk
        });
      }
    } else {
      // Fallback: The provider doesn't support streaming (or we haven't implemented it in the adapter yet)
      // Send the entire response as a single chunk
      chrome.runtime.sendMessage({
        type: "CHUNK",
        text: result
      });
    }

    // Indicate completion
    chrome.runtime.sendMessage({ type: "DONE" });

  } catch (error) {
    console.error("[Background Service Worker Error]:", error);
    chrome.runtime.sendMessage({
      type: "ERROR",
      message: error.message || "An unknown error occurred during AI generation."
    });
  }
}
