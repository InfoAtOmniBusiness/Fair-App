// Fair — API client. Set EXPO_PUBLIC_API_URL in mobile-demo/.env to your
// computer's LAN IP, e.g. http://192.168.1.42:8000/api  (find it: `ipconfig getifaddr en0`)
const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000/api";

export type Offer = {
  store: string; kind: "online" | "nearby"; price: number;
  buy_url: string | null; is_affiliate: boolean;
};
export type Comparison = {
  product: { upc: string; name: string; brand?: string; image_url?: string };
  offers: Offer[];
  best_nearby: number | null;
  fairness: {
    verdict: "green" | "yellow" | "red" | "unknown";
    triggered_by?: string; confidence: string; explanation: string;
    d30?: number; vs_nearby_best?: number; reference_store?: string;
  };
};
export type WatchItem = {
  id: number; upc: string; name: string; target_price: number | null;
};
export type Me = {
  id: number; email: string;
  consent_location: boolean; consent_marketing: boolean;
};

// Module-level token, set by AuthProvider on sign-in / session restore.
let authToken: string | null = null;
export function setAuthToken(token: string | null) { authToken = token; }

export class AuthRequiredError extends Error {
  constructor() { super("Sign in required"); this.name = "AuthRequiredError"; }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: { auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (opts.auth) {
    if (!authToken) throw new AuthRequiredError();
    headers.Authorization = `Bearer ${authToken}`;
  }
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const r = await fetch(`${BASE}${path}`, { ...init, headers });
  if (r.status === 401) throw new AuthRequiredError();
  if (!r.ok) {
    let detail = `API ${r.status}`;
    try {
      const body = await r.json();
      if (body?.detail) detail = String(body.detail);
    } catch { /* non-JSON error body — keep status text */ }
    throw new Error(detail);
  }
  return r.json();
}

// ---------------------------------------------------------------- products
export async function getComparison(
  upc: string, priceSeen?: number
): Promise<Comparison | null> {
  const q = priceSeen ? `?price_seen=${priceSeen}` : "";
  const r = await fetch(`${BASE}/products/by-upc/${upc}/comparison${q}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

// -------------------------------------------------------------------- auth
export async function apiRegister(
  email: string, password: string, consentLocation: boolean
): Promise<string> {
  const d = await request<{ access_token: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email, password, consent_location: consentLocation,
    }),
  });
  return d.access_token;
}

export async function apiLogin(email: string, password: string): Promise<string> {
  const form = new URLSearchParams({ username: email, password });
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!r.ok) {
    if (r.status === 401) throw new Error("Incorrect email or password");
    throw new Error(`API ${r.status}`);
  }
  const d = await r.json();
  return d.access_token as string;
}

export const apiMe = () => request<Me>("/auth/me", {}, { auth: true });

export const apiDeleteAccount = () =>
  request<{ status: string; detail: string }>(
    "/auth/account", { method: "DELETE" }, { auth: true });

export const apiExportData = () =>
  request<Record<string, unknown>>("/privacy/export", {}, { auth: true });

// --------------------------------------------------------------- watchlist
export const getWatchlist = () =>
  request<WatchItem[]>("/watchlist", {}, { auth: true });

export const addWatch = (upc: string, targetPrice?: number) =>
  request<{ status: string; watching: string }>("/watchlist", {
    method: "POST",
    body: JSON.stringify({ upc, target_price: targetPrice ?? null }),
  }, { auth: true });

export const removeWatch = (itemId: number) =>
  request<{ status: string }>(`/watchlist/${itemId}`,
    { method: "DELETE" }, { auth: true });

// ------------------------------------------------- crowdsourced prices
export const submitPrice = (upc: string, storeName: string, price: number) =>
  request<{ status: string }>("/prices", {
    method: "POST",
    body: JSON.stringify({ upc, store_name: storeName, price }),
  }, { auth: true });
