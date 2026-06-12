// Fair — auth context. Token persisted in SecureStore; session restored on
// launch. Scanning/comparison stay public — auth is only required to save
// (watchlist, price submission, account). Pattern salvaged from the May build
// (AuthContext + SecureStore + session restore), adapted to Expo Router.
import * as SecureStore from "expo-secure-store";
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from "react";
import {
  apiDeleteAccount, apiLogin, apiMe, apiRegister, Me, setAuthToken,
} from "./api";

const TOKEN_KEY = "fair_token";

type AuthState = {
  user: Me | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, consentLocation: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on launch; a dead/expired token is deleted, not retried.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!token) return;
        setAuthToken(token);
        const me = await apiMe();
        if (mounted) setUser(me);
      } catch {
        setAuthToken(null);
        await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const adoptToken = useCallback(async (token: string) => {
    setAuthToken(token);
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    setUser(await apiMe());
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await adoptToken(await apiLogin(email.trim().toLowerCase(), password));
  }, [adoptToken]);

  const signUp = useCallback(async (
    email: string, password: string, consentLocation: boolean
  ) => {
    await adoptToken(
      await apiRegister(email.trim().toLowerCase(), password, consentLocation));
  }, [adoptToken]);

  const signOut = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  }, []);

  // Apple App Review 5.1.1(v): in-app account deletion.
  const deleteAccount = useCallback(async () => {
    await apiDeleteAccount();
    await signOut();
  }, [signOut]);

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signOut, deleteAccount }),
    [user, loading, signIn, signUp, signOut, deleteAccount]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
