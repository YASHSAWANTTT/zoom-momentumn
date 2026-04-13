const isInsideZoom = navigator.userAgent.includes('ZoomApps') ||
  window.location.search.includes('zoomapp');

const DEMO_MODE = !isInsideZoom;
const DEMO_MEETING_ID = 'mock-meeting-001';

export function useDemoMode() {
  return {
    isDemoMode: DEMO_MODE,
    isInZoom: isInsideZoom,
    meetingId: DEMO_MODE ? DEMO_MEETING_ID : '',
  };
}
