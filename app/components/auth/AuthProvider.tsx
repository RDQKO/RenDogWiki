'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type Role = 'guest' | 'writer' | 'admin';
export type AuthUser = {
  id: number;
  username: string;
  email: string;
  minecraft_name: string;
  role?: Role;
} | null;
export type AuthMeResponse = {
  loggedIn?: boolean;
  user?: AuthUser;
  role?: string;
  roles?: string[];
  permissions?: string[];
  degraded?: boolean;
  roleSource?: string;
};

type AuthState = {
  user: AuthUser;
  role: Role;
  loggedIn: boolean;
  loading: boolean;
  hydrated: boolean;
  degraded: boolean;
  roleSource: string | null;
};
type AuthContextValue = AuthState & {
  canWrite: boolean;
  isAdmin: boolean;
  refreshAuth: (opts?: { force?: boolean }) => Promise<void>;
  setAuthFromPayload: (payload: Partial<AuthMeResponse>) => void;
  clearAuth: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const signedOut: AuthState = { user: null, role: 'guest', loggedIn: false, loading: false, hydrated: true, degraded: false, roleSource: null };
function normalizeRole(value: unknown): Role {
  return value === 'admin' || value === 'writer' ? value : 'guest';
}
function stateFromPayload(payload: Partial<AuthMeResponse>): AuthState {
  const user = payload.user ?? null;
  const loggedIn = !!user && Number.isInteger(user.id) && user.id > 0 && payload.loggedIn !== false;
  return { ...signedOut, user: loggedIn ? user : null, loggedIn,
    role: loggedIn ? normalizeRole(payload.role ?? user?.role) : 'guest', roleSource: payload.roleSource ?? null };
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ ...signedOut, loading: true, hydrated: false });
  const generation = useRef(0);
  const inFlight = useRef<{ controller: AbortController; promise: Promise<void>; generation: number } | null>(null);

  const cancelPending = useCallback(() => {
    generation.current += 1;
    inFlight.current?.controller.abort();
    inFlight.current = null;
  }, []);
  const clearAuth = useCallback(() => {
    cancelPending();
    setState(signedOut);
  }, [cancelPending]);
  const setAuthFromPayload = useCallback((payload: Partial<AuthMeResponse>) => {
    // A pre-login or pre-logout /me response must never replace a newer session.
    cancelPending();
    setState(stateFromPayload(payload));
  }, [cancelPending]);

  const refreshAuth = useCallback((opts?: { force?: boolean }): Promise<void> => {
    if (inFlight.current && !opts?.force) return inFlight.current.promise;
    cancelPending();
    const requestGeneration = generation.current;
    const controller = new AbortController();
    const current = () => requestGeneration === generation.current && !controller.signal.aborted;
    const promise = Promise.resolve().then(async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include', cache: 'no-store', signal: controller.signal,
        });
        if (!current()) return;
        if (response.status === 401 || response.status === 403) {
          setState(signedOut);
          return;
        }
        if (!response.ok) throw new Error(`auth-unavailable:${response.status}`);
        const payload = await response.json() as AuthMeResponse;
        if (!current()) return;
        if (payload.degraded) throw new Error('auth-unavailable:degraded');
        setState(stateFromPayload(payload));
      } catch (error) {
        if (!current()) return;
        console.warn('[AuthProvider] permission refresh unavailable:', error);
        // A temporary connection failure is not a logout or a role change.
        setState(previous => ({ ...previous, loading: false, hydrated: true, degraded: true }));
      } finally {
        if (inFlight.current?.generation === requestGeneration) inFlight.current = null;
      }
    });
    inFlight.current = { controller, promise, generation: requestGeneration };
    return promise;
  }, [cancelPending]);

  useEffect(() => {
    void refreshAuth();
    return cancelPending;
  }, [refreshAuth, cancelPending]);
  useEffect(() => {
    const changed = () => { void refreshAuth({ force: true }); };
    const focused = () => { void refreshAuth(); };
    window.addEventListener('rdwiki-auth-changed', changed);
    window.addEventListener('focus', focused);
    return () => {
      window.removeEventListener('rdwiki-auth-changed', changed);
      window.removeEventListener('focus', focused);
    };
  }, [refreshAuth]);

  const value = useMemo<AuthContextValue>(() => ({ ...state, refreshAuth, setAuthFromPayload, clearAuth,
    canWrite: state.loggedIn && (state.role === 'writer' || state.role === 'admin'),
    isAdmin: state.loggedIn && state.role === 'admin',
  }), [state, refreshAuth, setAuthFromPayload, clearAuth]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within <AuthProvider>');
  return context;
}
