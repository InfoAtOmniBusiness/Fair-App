"""Fair — core services.

1. UPC normalization  — iOS scanners return UPC-A as 13-digit EAN-13 with a
   leading zero; databases store either. Without this, real scans "fail".
2. OpenFoodFacts lookup — live product metadata, cached into our DB.
3. Fairness engine — implements the spec from the project docs:
     GREEN:  d30 <= 0.10 AND price within store's 180-day range
     YELLOW: 0.10 < d30 <= 0.20 OR price above the 180-day p90
     RED:    d30 > 0.20 OR (premium vs best nearby > 0.20 with enough data)
   plus honest fallbacks when history is too thin to judge.
4. Affiliate links — uses your tags when env vars are set; falls back to
   plain retailer links otherwise (so the demo works pre-approval).
"""
from __future__ import annotations

import os
import statistics
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

OFF_URL = "https://world.openfoodfacts.org/api/v2/product/{upc}.json"
OFF_FIELDS = "product_name,brands,categories_tags,image_front_url"


# ---------------------------------------------------------------- UPC handling
def upc_candidates(code: str) -> list[str]:
    """Return plausible representations of a scanned code, most-likely first."""
    code = "".join(ch for ch in code.strip() if ch.isdigit())
    cands = [code]
    if len(code) == 12:                # UPC-A → EAN-13
        cands.append("0" + code)
    elif len(code) == 13 and code.startswith("0"):   # EAN-13 → UPC-A
        cands.append(code[1:])
    elif len(code) == 8:               # UPC-E (leave expansion to V1.1, try padded)
        cands.append(code.zfill(13))
    return cands


# ------------------------------------------------------------- OpenFoodFacts
def _get_with_retry(url: str, params: dict, attempts: int = 3):
    """OpenFoodFacts is a live crowdsourced API — transient 5xx/timeouts happen
    (we watched a known-good UPC fail between two seed runs). Retry with backoff
    so one network blip doesn't silently drop a product."""
    for i in range(attempts):
        try:
            r = httpx.get(url, params=params, timeout=8.0,
                          headers={"User-Agent": "FairApp-Demo/0.1"})
            if r.status_code < 500:
                return r
        except httpx.HTTPError:
            pass
        time.sleep(1.2 * (i + 1))
    return None


def fetch_openfoodfacts(code: str) -> Optional[dict]:
    """Try each UPC candidate against OpenFoodFacts. Returns normalized dict or None."""
    for cand in upc_candidates(code):
        r = _get_with_retry(OFF_URL.format(upc=cand), {"fields": OFF_FIELDS})
        if r is None or r.status_code != 200:
            continue
        data = r.json()
        p = data.get("product") or {}
        name = (p.get("product_name") or "").strip()
        if data.get("status") == 1 and name:
            cats = p.get("categories_tags") or []
            return {
                "upc": cand,
                "name": name,
                "brand": (p.get("brands") or "").split(",")[0].strip() or None,
                "category": cats[-1].split(":")[-1].replace("-", " ") if cats else None,
                "image_url": p.get("image_front_url"),
            }
    return None


# ------------------------------------------------------------ Fairness engine
MIN_POINTS_30D = 5      # below this we refuse to judge (honest "unknown")
MIN_NEARBY_STORES = 3   # spec: nearby-premium rule needs enough nearby data


def _pctl(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * q
    f, c = int(k), min(int(k) + 1, len(s) - 1)
    return s[f] + (s[c] - s[f]) * (k - f)


def fairness_score(
    price_now: float,
    store_30d: list[float],
    store_180d: list[float],
    nearby_current: list[float],
) -> dict:
    """Score one observed price against history + the nearby market."""
    out = {
        "price_evaluated": round(price_now, 2),
        "verdict": "unknown",
        "confidence": "low",
        "d30": None,
        "p90_180d": None,
        "range_180d": None,
        "vs_nearby_best": None,
        "explanation": "",
    }
    if len(store_30d) < MIN_POINTS_30D:
        out["explanation"] = (
            "Not enough recent price history at this store to judge fairness yet. "
            "Scans like yours are what build it."
        )
        return out

    med30 = statistics.median(store_30d)
    d30 = (price_now - med30) / med30 if med30 else 0.0
    p90 = _pctl(store_180d, 0.90)
    lo, hi = min(store_180d), max(store_180d)
    in_range = (lo * 0.99) <= price_now <= (p90 * 1.02)

    nearby_best = min(nearby_current) if nearby_current else None
    dnb = ((price_now - nearby_best) / nearby_best) if nearby_best else None
    nearby_ok = len(nearby_current) >= MIN_NEARBY_STORES

    if d30 > 0.20:
        verdict, trigger = "red", "spike_vs_30d"
    elif dnb is not None and dnb > 0.20 and nearby_ok:
        verdict, trigger = "red", "premium_vs_nearby"
    elif 0.10 < d30 <= 0.20:
        verdict, trigger = "yellow", "creep_vs_30d"
    elif price_now > p90:
        verdict, trigger = "yellow", "above_180d_p90"
    elif d30 <= 0.10 and in_range:
        verdict, trigger = "green", "within_normal_range"
    else:
        verdict, trigger = "yellow", "outside_180d_range"

    s30_bit = f"{abs(d30):.0%} {'above' if d30 > 0 else 'below'} this store's 30-day median (${med30:.2f})"
    near_bit = (f"{abs(dnb):.0%} {'above' if dnb > 0 else 'below'} the best price nearby (${nearby_best:.2f})"
                if dnb is not None else None)
    p90_bit = f"above this store's typical 6-month high (${p90:.2f})"

    # Lead with whichever signal actually fired — e.g., a sustained spike makes
    # the store's own 30-day median look "normal" while the nearby premium
    # exposes it. That nuance IS the dynamic-pricing detection.
    if trigger == "premium_vs_nearby":
        bits = [near_bit, s30_bit]
    elif trigger == "above_180d_p90":
        bits = [p90_bit, near_bit or s30_bit]
    else:
        bits = [s30_bit] + ([near_bit] if near_bit else [])
    lead = {"green": "Fair price.", "yellow": "Borderline.", "red": "Likely overpaying."}[verdict]

    out.update({
        "verdict": verdict,
        "triggered_by": trigger,
        "confidence": "high" if len(store_180d) >= 30 else "medium",
        "d30": round(d30, 3),
        "p90_180d": round(p90, 2),
        "range_180d": [round(lo, 2), round(hi, 2)],
        "vs_nearby_best": round(dnb, 3) if dnb is not None else None,
        "explanation": f"{lead} This price is " + " and ".join(bits) + ".",
    })
    return out


# ------------------------------------------------------------ Affiliate links
def affiliate_link(retailer_key: Optional[str], upc: str, name: str) -> dict:
    """Build a retailer link; affiliate-tagged when env tags exist, plain otherwise."""
    q = name.replace(" ", "+")
    tag = {
        "amazon": os.getenv("AMAZON_AFFILIATE_TAG", ""),
        "walmart": os.getenv("WALMART_AFFILIATE_ID", ""),
        "target": os.getenv("TARGET_AFFILIATE_ID", ""),
    }.get(retailer_key or "", "")

    if retailer_key == "amazon":
        url = f"https://www.amazon.com/s?k={q}"
        if tag:
            url += f"&tag={tag}"
    elif retailer_key == "walmart":
        url = f"https://www.walmart.com/search?q={upc}"
        if tag:
            url += f"&affp1={tag}"      # placeholder param; real Walmart links go through Impact
    elif retailer_key == "target":
        url = f"https://www.target.com/s?searchTerm={q}"
        if tag:
            url += f"&afid={tag}"
    else:
        return {"url": None, "is_affiliate": False}
    return {"url": url, "is_affiliate": bool(tag)}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def days_ago(n: int) -> datetime:
    return now_utc() - timedelta(days=n)
