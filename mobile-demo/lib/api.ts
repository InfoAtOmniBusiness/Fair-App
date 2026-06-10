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

export async function getComparison(
  upc: string, priceSeen?: number
): Promise<Comparison | null> {
  const q = priceSeen ? `?price_seen=${priceSeen}` : "";
  const r = await fetch(`${BASE}/products/by-upc/${upc}/comparison${q}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}
