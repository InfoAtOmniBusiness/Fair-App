"""Fair — demo seeder.

Pulls REAL product metadata live from OpenFoodFacts for a curated list of
common US grocery UPCs, then generates 180 days of realistic price history
across 3 online retailers + 3 "nearby" stores.

Three products are deliberately shaped to demonstrate each verdict:
  GREEN  — stable pricing (Coca-Cola)
  YELLOW — mild 13% creep over the last 30 days (Jif)
  RED    — 24% dynamic-pricing spike at one nearby store (Honey Nut Cheerios)

Also writes static/embedded_data.json: captured comparison output used by the
offline preview page. NOTE: store prices are SEEDED, not live retailer prices.
"""
import json
import math
import os
import random
import sys
from datetime import timedelta

from db import Price, Product, SessionLocal, Store, init_db
from services import days_ago, fetch_openfoodfacts

random.seed(42)

# (upc, base_price, shape)  shape: stable | creep | spike
CURATED = [
    ("049000050103", 2.29, "stable"),   # Coca-Cola — the test UPC from your docs
    ("012000161155", 2.19, "stable"),   # Pepsi
    ("016000275270", 4.49, "spike"),    # Honey Nut Cheerios  -> RED demo
    ("051500255162", 3.79, "creep"),    # Jif Creamy          -> YELLOW demo
    ("030000010204", 4.99, "stable"),   # Quaker Old Fashioned Oats
    ("044000032029", 4.29, "stable"),   # Oreo
    ("013000006408", 4.59, "stable"),   # Heinz Ketchup
    ("048001006911", 3.49, "stable"),   # Skippy Creamy
    ("024100106851", 4.99, "stable"),   # Cheez-It Original
    ("021000615872", 4.79, "stable"),   # Philadelphia Cream Cheese
    ("076840100354", 5.99, "stable"),   # Ben & Jerry's
    ("018894700156", 3.29, "stable"),   # (coverage test — may not resolve)
    ("099999999999", 1.99, "stable"),   # (intentional miss — proves 404 handling)
]

STORES = [
    ("Amazon", "online", "amazon", 0.97),
    ("Walmart", "online", "walmart", 0.94),
    ("Target", "online", "target", 1.00),
    ("Kroger — Main St", "nearby", None, 1.06),
    ("Safeway — Downtown", "nearby", None, 1.12),
    ("Trader Joe's — 5th Ave", "nearby", None, 1.02),
]

SPIKE_STORE = "Safeway — Downtown"

# The three chip products carry the demo's green/yellow/red story. If
# OpenFoodFacts is down even after retries, fall back to built-in metadata
# (clearly labeled source="fallback") so the demo can never seed without them.
FALLBACK_META = {
    "049000050103": {"upc": "049000050103", "name": "Coca-Cola Classic, 12 fl oz",
                     "brand": "Coca-Cola", "category": "sodas",
                     "image_url": None, "source": "fallback"},
    "051500255162": {"upc": "051500255162", "name": "Jif Creamy Peanut Butter",
                     "brand": "Jif", "category": "peanut butters",
                     "image_url": None, "source": "fallback"},
    "016000275270": {"upc": "016000275270", "name": "Honey Nut Cheerios",
                     "brand": "General Mills", "category": "cereals",
                     "image_url": None, "source": "fallback"},
}


def price_series(base: float, mult: float, shape: str, is_spike_store: bool) -> list[tuple[int, float]]:
    """(days_ago, price) every ~2 days for 180 days, with weekly noise + promos."""
    out = []
    for d in range(180, -1, -2):
        p = base * mult
        p *= 1 + 0.015 * math.sin(d / 7.0)            # weekly wobble
        p *= 1 + random.uniform(-0.015, 0.015)         # noise
        if random.random() < 0.05:                     # occasional promo
            p *= 0.85
        if shape == "creep" and d <= 30:
            p *= 1 + 0.13 * (30 - d) / 30              # +13% ramp -> YELLOW
        if shape == "spike" and is_spike_store and d <= 21:
            p *= 1.24                                   # +24% jump -> RED
        out.append((d, round(p, 2)))
    return out


def main():
    init_db()
    db = SessionLocal()
    if db.query(Product).count():
        print("Already seeded — skipping. (Delete fair_demo.db to reseed.)")
        return

    stores = []
    for name, kind, key, mult in STORES:
        s = Store(name=name, kind=kind, retailer_key=key)
        db.add(s); stores.append((s, mult))
    db.commit()

    resolved, missed = [], []
    for upc, base, shape in CURATED:
        meta = fetch_openfoodfacts(upc)
        if not meta and upc in FALLBACK_META:
            meta = dict(FALLBACK_META[upc])
            print(f"  ~ {upc}  OpenFoodFacts unavailable — using built-in fallback metadata")
        if not meta:
            missed.append(upc)
            print(f"  ✗ {upc}  not found on OpenFoodFacts — skipped")
            continue
        prod = Product(**meta)
        db.add(prod); db.commit(); db.refresh(prod)
        resolved.append(prod)
        n = 0
        for store, mult in stores:
            for d, price in price_series(base, mult, shape,
                                         store.name == SPIKE_STORE):
                db.add(Price(product_id=prod.id, store_id=store.id, price=price,
                             observed_at=days_ago(d).replace(tzinfo=None)))
                n += 1
        db.commit()
        print(f"  ✓ {upc}  {meta['name']!r:42s} ({meta['brand']})  +{n} price points")

    print(f"\nSeeded {len(resolved)} real products, "
          f"{db.query(Price).count()} price points across {len(stores)} stores. "
          f"({len(missed)} UPC(s) skipped — handled gracefully.)")

    # ---- capture comparison output for the offline preview page ----
    from fastapi.testclient import TestClient
    from main import app
    client = TestClient(app)
    embedded = {"generated_at": str(days_ago(0)), "note":
                "Captured output of the real Fair API. Store prices are seeded demo data, not live retailer prices.",
                "products": []}
    for prod in resolved:
        variants = [None] + ([6.19] if prod.upc == "016000275270" else [])
        for seen in variants:
            params = {"price_seen": seen} if seen else {}
            r = client.get(f"/api/products/by-upc/{prod.upc}/comparison", params=params)
            if r.status_code == 200:
                entry = r.json()
                entry["price_seen"] = seen
                embedded["products"].append(entry)
            else:
                print(f"  ! capture failed {prod.upc} seen={seen}: "
                      f"HTTP {r.status_code} {r.text[:120]}")
    out_path = os.path.join(os.path.dirname(__file__), "static", "embedded_data.json")
    with open(out_path, "w") as f:
        json.dump(embedded, f)
    print(f"Wrote offline preview data → {out_path} "
          f"({len(embedded['products'])} comparisons)")


if __name__ == "__main__":
    sys.exit(main())
