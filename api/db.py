"""Fair — database engine and models.

DATABASE_URL defaults to SQLite so the demo runs with zero setup;
docker-compose overrides it to PostgreSQL for the prod-like path.
"""
import os
from datetime import datetime, timezone

from sqlalchemy import (Boolean, Column, DateTime, Float, ForeignKey, Integer,
                        String, UniqueConstraint, create_engine)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./fair_demo.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    consent_location = Column(Boolean, default=False)
    consent_marketing = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)
    deleted_at = Column(DateTime, nullable=True)  # soft-delete; Apple 5.1.1(v)

    watchlist = relationship("WatchlistItem", back_populates="user")


class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True)
    upc = Column(String, unique=True, index=True, nullable=False)  # normalized
    name = Column(String, nullable=False)
    brand = Column(String, nullable=True)
    category = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    source = Column(String, default="openfoodfacts")
    created_at = Column(DateTime, default=utcnow)

    prices = relationship("Price", back_populates="product")


class Store(Base):
    __tablename__ = "stores"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    kind = Column(String, nullable=False)  # "online" | "nearby"
    retailer_key = Column(String, nullable=True)  # amazon|walmart|target for affiliate links
    city = Column(String, nullable=True)

    prices = relationship("Price", back_populates="store")


class Price(Base):
    __tablename__ = "prices"
    __table_args__ = (UniqueConstraint("product_id", "store_id", "observed_at"),)
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), index=True, nullable=False)
    store_id = Column(Integer, ForeignKey("stores.id"), index=True, nullable=False)
    price = Column(Float, nullable=False)
    observed_at = Column(DateTime, index=True, default=utcnow)
    source = Column(String, default="seed")  # seed | user | api

    product = relationship("Product", back_populates="prices")
    store = relationship("Store", back_populates="prices")


class Scan(Base):
    __tablename__ = "scans"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    upc = Column(String, index=True)
    found = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"
    __table_args__ = (UniqueConstraint("user_id", "product_id"),)
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    target_price = Column(Float, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="watchlist")
    product = relationship("Product")


def init_db():
    Base.metadata.create_all(bind=engine)
