import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n';

// Global fix for Google Translate breaking Material Symbols ligatures
const protectIcons = () => {
  document.querySelectorAll('.material-symbols-outlined').forEach(icon => {
    if (!icon.classList.contains('notranslate')) {
      icon.classList.add('notranslate');
    }
  });
  
  // Forcefully remove the Google Translate top banner if it appears
  const banner = document.querySelector('.goog-te-banner-frame, .VIpgJd-Zvi9od-aZ2wEe-wOHMyf');
  if (banner) {
    banner.style.display = 'none';
    banner.remove();
  }
  // Reset body top
  if (document.body.style.top !== '0px') {
    document.body.style.top = '0px';
  }
};
setTimeout(protectIcons, 100);
const observer = new MutationObserver(() => protectIcons());
observer.observe(document.body, { childList: true, subtree: true });

// CRITICAL FIX: Google Translate replaces React text nodes with <font> tags.
// When React tries to update those nodes, it crashes with "insertBefore/removeChild on Node".
// This monkey-patch prevents React from crashing when the DOM is modified by Google Translate.
if (typeof Node === 'function' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child.parentNode !== this) {
      return child;
    }
    return originalRemoveChild.apply(this, arguments);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      return newNode;
    }
    return originalInsertBefore.apply(this, arguments);
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
