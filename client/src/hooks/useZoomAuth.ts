import { useState, useEffect, useCallback } from 'react';
import zoomSdk from '@zoom/appssdk';

interface AuthState {
  user: { id: string; displayName: string; email: string; role: string } | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useZoomAuth() {
  const [auth, setAuth] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  // Check if already authenticated
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const user = await res.json();
          setAuth({ user, isAuthenticated: true, isLoading: false, error: null });
        } else {
          setAuth((prev) => ({ ...prev, isLoading: false }));
        }
      } catch {
        setAuth((prev) => ({ ...prev, isLoading: false }));
      }
    };
    checkAuth();
  }, []);

  const login = useCallback(async () => {
    try {
      setAuth((prev) => ({ ...prev, isLoading: true, error: null }));

      // Step 1: Get code challenge from backend
      const challengeRes = await fetch('/api/auth/authorize', { credentials: 'include' });
      if (!challengeRes.ok) throw new Error('Failed to get auth challenge');
      const { codeChallenge, state } = await challengeRes.json();

      // Step 2: Register onAuthorized listener BEFORE calling authorize
      const authPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Auth timeout')), 30000);
        zoomSdk.onAuthorized((event: { code: string }) => {
          clearTimeout(timeout);
          resolve(event.code);
        });
      });

      // Step 3: Trigger Zoom's native OAuth consent UI
      await zoomSdk.authorize({
        codeChallenge,
        state,
      });

      // Step 4: Wait for the authorization code
      const code = await authPromise;

      // Step 5: Exchange code for session via backend
      const callbackRes = await fetch('/api/auth/callback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state }),
      });

      if (!callbackRes.ok) throw new Error('Auth callback failed');
      const user = await callbackRes.json();

      setAuth({ user, isAuthenticated: true, isLoading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setAuth((prev) => ({ ...prev, isLoading: false, error: message }));
    }
  }, []);

  return { ...auth, login };
}
