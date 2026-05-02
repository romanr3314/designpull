/**
 * lib/extractor.js
 * 
 * Injected into the active tab to extract design system properties
 * from the live DOM using getComputedStyle().
 */

function extractDesignSystem() {
  const captureMode = window.__designpullCaptureMode || 'full';

  // Sample elements to a reasonable subset (e.g., 150 elements) to avoid performance lag
  let allElements = Array.from(document.querySelectorAll('body *'));
  
  if (captureMode === 'view') {
    allElements = allElements.filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    });
  }

  const sampleElements = allElements.length > 150 
    ? [document.body, ...getRandomSample(allElements, 150)] 
    : [document.body, ...allElements];

  const designSystem = {
    metadata: getMetadata(),
    colors: {
      cssVariables: getCSSVariables(),
      background: getTopValues(getFrequencyMap(sampleElements, 'backgroundColor'), 10),
      text: getTopValues(getFrequencyMap(sampleElements, 'color'), 10),
      border: getTopValues(getFrequencyMap(sampleElements, 'borderColor'), 10)
    },
    typography: {
      fontFamilies: getTopValues(getFrequencyMap(sampleElements, 'fontFamily'), 5),
      fontSizes: getTopValues(getFrequencyMap(sampleElements, 'fontSize'), 8),
      fontWeights: getTopValues(getFrequencyMap(sampleElements, 'fontWeight'), 5),
      lineHeights: getTopValues(getFrequencyMap(sampleElements, 'lineHeight'), 8),
      letterSpacings: getTopValues(getFrequencyMap(sampleElements, 'letterSpacing'), 5)
    },
    spacing: {
      padding: getTopValues(getFrequencyMap(sampleElements, 'padding'), 10),
      margin: getTopValues(getFrequencyMap(sampleElements, 'margin'), 10)
    },
    borders: {
      radius: getTopValues(getFrequencyMap(sampleElements, 'borderRadius'), 5)
    },
    effects: {
      boxShadows: getTopValues(getFrequencyMap(sampleElements, 'boxShadow', ['none']), 5)
    },
    animations: {
      transitions: getTopValues(getFrequencyMap(sampleElements, 'transitionDuration', ['0s']), 5)
    }
  };

  return designSystem;

  // --- Helper Functions --- //

  function getRandomSample(arr, size) {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, size);
  }

  function getMetadata() {
    const title = document.title;
    const metaDesc = document.querySelector('meta[name="description"]');
    return {
      title: title || 'No Title',
      description: metaDesc ? metaDesc.getAttribute('content') : ''
    };
  }

  function getFrequencyMap(elements, cssProperty, ignoreValues = []) {
    const freqMap = {};
    // Ignore common defaults and transparent values to reduce noise
    const defaultIgnore = ['rgba(0, 0, 0, 0)', 'transparent', '0px', 'none', 'normal', 'auto', '0s', '0px 0px', '0px 0px 0px'];
    const skipValues = new Set([...defaultIgnore, ...ignoreValues]);

    elements.forEach(el => {
      try {
        const style = window.getComputedStyle(el);
        const value = style[cssProperty];
        // Ensure value exists and isn't a default/ignored string
        if (value && !skipValues.has(value) && !value.includes('initial')) {
          freqMap[value] = (freqMap[value] || 0) + 1;
        }
      } catch (e) {
        // Silently catch elements that might not support computed styles
      }
    });
    return freqMap;
  }

  function getTopValues(freqMap, limit) {
    return Object.entries(freqMap)
      .sort((a, b) => b[1] - a[1]) // Sort by frequency (highest first)
      .map(entry => entry[0])      // Return only the CSS value
      .slice(0, limit);            // Limit to the requested amount
  }

  function getCSSVariables() {
    const variables = {};
    try {
      for (const sheet of document.styleSheets) {
        // Skip cross-origin stylesheets (they will throw a SecurityError if accessed)
        if (sheet.href && !sheet.href.startsWith(window.location.origin)) continue;
        
        try {
          for (const rule of sheet.cssRules) {
            if (rule.style) {
              for (let i = 0; i < rule.style.length; i++) {
                const prop = rule.style[i];
                if (prop.startsWith('--')) {
                  variables[prop] = rule.style.getPropertyValue(prop).trim();
                }
              }
            }
          }
        } catch (e) {
          // Ignore individual rules that cannot be accessed
        }
      }
    } catch (e) {
      // Ignore global stylesheet iteration errors
    }
    return variables;
  }
}

// In Manifest V3, we inject this using chrome.scripting.executeScript.
// Returning the function call directly allows executeScript to capture the JSON output.
extractDesignSystem();
