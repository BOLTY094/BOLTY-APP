import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as AppleAuthentication from "expo-apple-authentication";

import { api, setToken, clearToken, loadToken } from "@/src/api";

WebBrowser.maybeCompleteAuthSession();

export type User = {
  user_id: string;
  name: string;
  email: string;
  role: "customer" | "admin";
  auth_provider?: string;
  picture?: string;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  welcomePending: boolean;
  consumeWelcome: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, referralCode?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

const sentSessionIds = new Set<string>();

function extractSessionId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function exchangeSession(sessionId: string): Promise<User> {
  const data = await api<{ token: string; user: User }>("/auth/session", {
    method: "POST",
    auth: false,
    body: { session_id: sessionId },
  });
  await setToken(data.token);
  return data.user;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // True right after an explicit login/registration: triggers the animated welcome screen.
  const [welcomePending, setWelcomePending] = useState(false);

  const onLoggedIn = useCallback((u: User) => {
    setWelcomePending(true);
    setUser(u);
  }, []);
  const consumeWelcome = useCallback(() => setWelcomePending(false), []);

  const checkExisting = useCallback(async () => {
    try {
      const token = await loadToken();
      if (!token) {
        setUser(null);
        return;
      }
      const data = await api<{ user: User }>("/auth/me");
      setUser(data.user);
    } catch {
      await clearToken();
      setUser(null);
    }
  }, []);

  // Web: handle session_id in URL first
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "web") {
          const href = typeof window !== "undefined" ? window.location.href : "";
          const sid = extractSessionId(href);
          if (sid && !sentSessionIds.has(sid)) {
            sentSessionIds.add(sid);
            const u = await exchangeSession(sid);
            onLoggedIn(u);
            try {
              const clean = window.location.origin + window.location.pathname;
              window.history.replaceState(window.history.state, "", clean);
            } catch {}
            setLoading(false);
            return;
          }
        }
        await checkExisting();
      } finally {
        setLoading(false);
      }
    })();
  }, [checkExisting, onLoggedIn]);

  // Mobile: cold-start + hot deep links
  useEffect(() => {
    if (Platform.OS === "web") return;
    const handle = async (url: string | null) => {
      const sid = extractSessionId(url);
      if (sid && !sentSessionIds.has(sid)) {
        sentSessionIds.add(sid);
        try {
          const u = await exchangeSession(sid);
          onLoggedIn(u);
        } catch {}
      }
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", (e) => handle(e.url));
    return () => sub.remove();
  }, [onLoggedIn]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
    await setToken(data.token);
    onLoggedIn(data.user);
  }, [onLoggedIn]);

  const register = useCallback(async (name: string, email: string, password: string, referralCode?: string) => {
    const data = await api<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      auth: false,
      body: { name, email, password, referral_code: referralCode || null },
    });
    await setToken(data.token);
    onLoggedIn(data.user);
  }, [onLoggedIn]);

  const loginWithGoogle = useCallback(async () => {
    const redirectUrl =
      Platform.OS === "web"
        ? window.location.origin + "/"
        : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }

    let captured: string | null = null;
    const sub = Linking.addEventListener("url", (e) => {
      if (!captured) captured = e.url;
    });
    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      let url: string | null = null;
      if (result.type === "success" && (result as any).url) {
        url = (result as any).url;
      }
      if (!url) url = captured;
      if (!url) url = await Linking.getInitialURL();
      const sid = extractSessionId(url);
      if (sid && !sentSessionIds.has(sid)) {
        sentSessionIds.add(sid);
        const u = await exchangeSession(sid);
        onLoggedIn(u);
      } else if (!sid) {
        throw new Error("Accesso Google annullato");
      }
    } finally {
      sub.remove();
    }
  }, [onLoggedIn]);

  const loginWithApple = useCallback(async () => {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    const identityToken = credential.identityToken;
    if (!identityToken) throw new Error("Apple: token mancante");
    const fullName = credential.fullName
      ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(" ")
      : undefined;
    const data = await api<{ token: string; user: User }>("/auth/apple", {
      method: "POST",
      auth: false,
      body: {
        identity_token: identityToken,
        name: fullName || null,
        email: credential.email || null,
      },
    });
    await setToken(data.token);
    onLoggedIn(data.user);
  }, [onLoggedIn]);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    await clearToken();
    setWelcomePending(false);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    await checkExisting();
  }, [checkExisting]);

  return (
    <AuthContext.Provider value={{ user, loading, welcomePending, consumeWelcome, login, register, loginWithGoogle, loginWithApple, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
