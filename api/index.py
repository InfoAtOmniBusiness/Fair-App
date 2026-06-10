"""Vercel entrypoint. Serverless filesystems are read-only except /tmp, so the
pre-seeded SQLite db ships in the bundle and is copied to /tmp on cold start.
Reads always work; writes (accounts, watchlist) persist per warm instance —
acceptable for a demo, Postgres for production."""
import os, pathlib, shutil, sys

# Vercel imports this file with the project root on sys.path (not api/), so make
# sibling modules (main, db, services) importable regardless of the cwd.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

_bundled = pathlib.Path(__file__).parent / "fair_demo.db"
_tmp = pathlib.Path("/tmp/fair_demo.db")
if _bundled.exists() and not _tmp.exists():
    shutil.copy(_bundled, _tmp)
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}")

from main import app  # noqa: E402,F401
