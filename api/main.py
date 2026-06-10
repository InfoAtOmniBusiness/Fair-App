"""Fair — demo API. Run: uvicorn main:app --host 0.0.0.0 --port 8000"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, FastAPI, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer
from passlib.hash import bcrypt
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.orm import Session

import services as svc
from db import (Price, Product, Scan, SessionLocal, Store, User,
                WatchlistItem, init_db)

JWT_SECRET = os.getenv("JWT_SECRET_KEY", "dev-only-secret")
JWT_ALG = "HS256"
TOKEN_TTL_HOURS = 24

app = FastAPI(title="Fair API (demo)", version="0.1.0")
app.add_middleware(  # demo-wide CORS; tighten before production
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def make_token(user_id: int) -> str:
    payload = {"sub": str(user_id),
               "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def current_user(token: str = Depends(oauth2), db: Session = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user = db.get(User, int(payload["sub"]))
    except Exception:
        user = None
    if not user or user.deleted_at:
        raise HTTPException(401, "Invalid or expired token")
    return user


# --------------------------------------------------------------------- schemas
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    consent_location: bool = False
    consent_marketing: bool = False


class PriceIn(BaseModel):
    upc: str
    store_name: str
    price: float


class WatchIn(BaseModel):
    upc: str
    target_price: Optional[float] = None


# ------------------------------------------------------------------------ auth
@app.post("/api/auth/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(409, "Email already registered")
    user = User(email=body.email, password_hash=bcrypt.hash(body.password),
                consent_location=body.consent_location,
                consent_marketing=body.consent_marketing)
    db.add(user); db.commit(); db.refresh(user)
    return {"access_token": make_token(user.id), "token_type": "bearer"}


@app.post("/api/auth/login")
def login(username: str = Form(...), password: str = Form(...),
          db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == username, User.deleted_at.is_(None)).first()
    if not user or not bcrypt.verify(password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    return {"access_token": make_token(user.id), "token_type": "bearer"}


@app.get("/api/auth/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email,
            "consent_location": user.consent_location,
            "consent_marketing": user.consent_marketing}


@app.delete("/api/auth/account", status_code=200)
def delete_account(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """In-app account deletion — Apple App Review Guideline 5.1.1(v)."""
    db.query(WatchlistItem).filter(WatchlistItem.user_id == user.id).delete()
    db.query(Scan).filter(Scan.user_id == user.id).update({Scan.user_id: None})
    user.email = f"deleted_user_{user.id}@deleted.invalid"
    user.password_hash = "!"
    user.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "deleted",
            "detail": "Account anonymized; contributed price data retained without identity."}


@app.get("/api/privacy/export")
def export_data(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """GDPR Art. 20 / CCPA data portability."""
    scans = db.query(Scan).filter(Scan.user_id == user.id).all()
    watch = db.query(WatchlistItem).filter(WatchlistItem.user_id == user.id).all()
    return {
        "account": {"email": user.email, "created_at": str(user.created_at),
                    "consent_location": user.consent_location,
                    "consent_marketing": user.consent_marketing},
        "scans": [{"upc": s.upc, "found": s.found, "at": str(s.created_at)} for s in scans],
        "watchlist": [{"product_id": w.product_id, "target_price": w.target_price} for w in watch],
    }


# -------------------------------------------------------------------- products
def _get_or_fetch_product(code: str, db: Session) -> Optional[Product]:
    for cand in svc.upc_candidates(code):
        prod = db.query(Product).filter(Product.upc == cand).first()
        if prod:
            return prod
    meta = svc.fetch_openfoodfacts(code)
    if not meta:
        return None
    prod = Product(**meta)
    db.add(prod); db.commit(); db.refresh(prod)
    return prod


@app.get("/api/products/by-upc/{code}")
def product_by_upc(code: str, db: Session = Depends(get_db)):
    prod = _get_or_fetch_product(code, db)
    db.add(Scan(upc=code, found=bool(prod))); db.commit()
    if not prod:
        raise HTTPException(404, "Product not found. Try manual entry or another barcode.")
    return {"id": prod.id, "upc": prod.upc, "name": prod.name, "brand": prod.brand,
            "category": prod.category, "image_url": prod.image_url, "source": prod.source}


@app.get("/api/products/by-upc/{code}/comparison")
def comparison(code: str,
               price_seen: Optional[float] = Query(None, description="Shelf price the user sees (optional)"),
               db: Session = Depends(get_db)):
    prod = _get_or_fetch_product(code, db)
    if not prod:
        raise HTTPException(404, "Product not found")

    cutoff_offer = svc.days_ago(14)
    offers, nearby_current = [], []
    history_by_store: dict[str, list] = {}

    for store in db.query(Store).all():
        rows = (db.query(Price)
                  .filter(Price.product_id == prod.id, Price.store_id == store.id)
                  .order_by(Price.observed_at.asc()).all())
        if not rows:
            continue
        latest = rows[-1]
        if latest.observed_at.replace(tzinfo=timezone.utc) < cutoff_offer:
            continue
        link = svc.affiliate_link(store.retailer_key, prod.upc, prod.name)
        offers.append({"store": store.name, "kind": store.kind,
                       "price": round(latest.price, 2),
                       "observed_at": str(latest.observed_at),
                       "buy_url": link["url"], "is_affiliate": link["is_affiliate"]})
        if store.kind == "nearby":
            nearby_current.append(latest.price)
        history_by_store[store.name] = rows

    if not offers:
        return {"product": {"upc": prod.upc, "name": prod.name, "brand": prod.brand,
                            "image_url": prod.image_url},
                "offers": [], "fairness": {
                    "verdict": "unknown", "confidence": "low",
                    "explanation": "No price data yet for this product. Be the first to submit a price!"}}

    offers.sort(key=lambda o: o["price"])

    # Reference price: the shelf price the user typed, else the median current
    # nearby price (a stand-in for "the price in front of you" in barcode-only MVP).
    if price_seen is not None:
        ref_price = float(price_seen)
        ref_pool = nearby_current or [o["price"] for o in offers]
        ref_store_name = min(history_by_store,
                             key=lambda n: abs(history_by_store[n][-1].price - ref_price))
    else:
        pool = sorted(nearby_current) or sorted(o["price"] for o in offers)
        ref_price = pool[len(pool) // 2]
        ref_store_name = next((o["store"] for o in offers
                               if abs(o["price"] - ref_price) < 0.001 and o["kind"] == "nearby"),
                              offers[0]["store"])

    ref_rows = history_by_store.get(ref_store_name, [])
    d30c, d180c = svc.days_ago(30), svc.days_ago(180)
    s30 = [r.price for r in ref_rows if r.observed_at.replace(tzinfo=timezone.utc) >= d30c]
    s180 = [r.price for r in ref_rows if r.observed_at.replace(tzinfo=timezone.utc) >= d180c]

    fair = svc.fairness_score(ref_price, s30, s180, nearby_current)
    fair["reference_store"] = ref_store_name
    fair["reference_source"] = "price_seen" if price_seen is not None else "median_nearby"

    spark = [{"date": r.observed_at.date().isoformat(), "price": round(r.price, 2)}
             for r in ref_rows][-30:]

    return {"product": {"upc": prod.upc, "name": prod.name, "brand": prod.brand,
                        "category": prod.category, "image_url": prod.image_url},
            "offers": offers,
            "best_nearby": min(nearby_current) if nearby_current else None,
            "fairness": fair,
            "history_30d": {ref_store_name: spark}}


@app.post("/api/prices", status_code=201)
def submit_price(body: PriceIn, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    prod = _get_or_fetch_product(body.upc, db)
    if not prod:
        raise HTTPException(404, "Unknown product")
    store = db.query(Store).filter(Store.name == body.store_name).first()
    if not store:
        store = Store(name=body.store_name, kind="nearby")
        db.add(store); db.commit(); db.refresh(store)
    db.add(Price(product_id=prod.id, store_id=store.id, price=body.price, source="user"))
    db.commit()
    return {"status": "ok"}


# -------------------------------------------------------------------- watchlist
@app.get("/api/watchlist")
def get_watchlist(user: User = Depends(current_user), db: Session = Depends(get_db)):
    items = db.query(WatchlistItem).filter(WatchlistItem.user_id == user.id).all()
    return [{"id": w.id, "upc": w.product.upc, "name": w.product.name,
             "target_price": w.target_price} for w in items]


@app.post("/api/watchlist", status_code=201)
def add_watch(body: WatchIn, user: User = Depends(current_user),
              db: Session = Depends(get_db)):
    prod = _get_or_fetch_product(body.upc, db)
    if not prod:
        raise HTTPException(404, "Unknown product")
    if db.query(WatchlistItem).filter_by(user_id=user.id, product_id=prod.id).first():
        raise HTTPException(409, "Already on watchlist")
    db.add(WatchlistItem(user_id=user.id, product_id=prod.id,
                         target_price=body.target_price))
    db.commit()
    return {"status": "ok", "watching": prod.name}


@app.delete("/api/watchlist/{item_id}")
def remove_watch(item_id: int, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    n = (db.query(WatchlistItem)
           .filter(WatchlistItem.id == item_id, WatchlistItem.user_id == user.id)
           .delete())
    db.commit()
    if not n:
        raise HTTPException(404, "Not found")
    return {"status": "removed"}


# ------------------------------------------------------------------------ misc
@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    return {"status": "healthy",
            "products": db.query(func.count(Product.id)).scalar(),
            "prices": db.query(func.count(Price.id)).scalar()}


_DEMO_HTML = os.path.join(os.path.dirname(__file__), "static", "demo.html")


@app.get("/")
@app.get("/demo")
def demo_page():
    # Live-mode landing page (auto-detects the API via /api/health). Served from
    # the function because Vercel routes all paths here; root static files at the
    # repo root are not part of the Python function bundle.
    return FileResponse(_DEMO_HTML)


init_db()
