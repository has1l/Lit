import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchMe, login as apiLogin, logout as apiLogout } from '../api/auth.js';
import { tokenStore } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [status, setStatus]   = useState(tokenStore.get() ? 'loading' : 'guest');
  const [error, setError]     = useState(null);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null);
      setStatus('guest');
      return null;
    }
    try {
      const me = await fetchMe();
      setUser(me);
      setStatus('authenticated');
      setError(null);
      return me;
    } catch (err) {
      tokenStore.clear();
      setUser(null);
      setStatus('guest');
      setError(err);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (email, password) => {
      setStatus('loading');
      setError(null);
      try {
        await apiLogin(email, password);
        await refresh();
      } catch (err) {
        setStatus('guest');
        setError(err);
        throw err;
      }
    },
    [refresh],
  );

  const logout = useCallback(() => {
    apiLogout();
    setUser(null);
    setStatus('guest');
  }, []);

  const value = useMemo(
    () => ({ user, status, error, login, logout, refresh }),
    [user, status, error, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
