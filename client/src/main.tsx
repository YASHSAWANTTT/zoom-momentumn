import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DevPreview } from './DevPreview';
import './index.css';

// The SDK script (sdk.js) is loaded via index.html and sets window.zoomSdk globally,
// even outside Zoom. To detect if we're actually inside a Zoom meeting, check for the
// Zoom embedded browser's user-agent or the zoomapp query parameter that Zoom injects.
const isInsideZoom = navigator.userAgent.includes('ZoomApps') ||
  window.location.search.includes('zoomapp');

const params = new URLSearchParams(window.location.search);
const forceApp = params.get('app') === '1';

const RootComponent = (forceApp || isInsideZoom) ? App : DevPreview;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);
