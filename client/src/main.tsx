import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DevPreview } from './DevPreview';
import { ErrorBoundary } from './ErrorBoundary';
import './index.css';

// sdk.js sets window.zoomSdk even in a normal browser, so do not use zoomSdk alone.
// Inside Zoom's in-meeting panel we usually get ZoomApps UA, ?zoomapp=, or an iframe (parent !== self).
const w = window as unknown as { zoomSdk?: unknown };
const inEmbeddedFrame = window.parent !== window.self;
const isInsideZoom =
  navigator.userAgent.includes('ZoomApps') ||
  window.location.search.includes('zoomapp') ||
  (inEmbeddedFrame && typeof w.zoomSdk !== 'undefined');

const params = new URLSearchParams(window.location.search);
const forceApp = params.get('app') === '1';

const RootComponent = (forceApp || isInsideZoom) ? App : DevPreview;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RootComponent />
    </ErrorBoundary>
  </React.StrictMode>,
);
