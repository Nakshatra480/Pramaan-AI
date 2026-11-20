"""Find storage objects with no matching document row (and rows whose original is missing).

    python -m scripts.reconcile_storage            # report only
    python -m scripts.reconcile_storage --delete   # also delete orphaned objects

Only keys under users/ are considered (the legacy local text/ layout is dev-only). Prints keys, never credentials.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy import select

from app.db.database import get_engine, get_sessionmaker
from app.db.models import Document
from app.services.storage.base import get_storage


async def main(delete: bool) -> int:
    storage = get_storage()
    async with get_sessionmaker()() as db:
        docs = (await db.scalars(select(Document))).all()
    expected = {k for d in docs for k in (d.storage_key, d.meta.get("text_key")) if k}
    objects = set(await storage.list_keys("users/"))
    orphans = sorted(o for o in objects if o not in expected)
    missing = sorted(d.storage_key for d in docs if d.storage_key and d.storage_key.startswith("users/") and d.storage_key not in objects)
    print(f"backend={storage.backend} documents={len(docs)} objects={len(objects)} orphans={len(orphans)} missing_originals={len(missing)}")
    for o in orphans:
        print("orphan:", o)
    for m in missing:
        print("missing:", m)
    if delete:
        for o in orphans:
            await storage.delete(o)
        print(f"deleted {len(orphans)} orphaned objects")
    await get_engine().dispose()
    return 1 if missing else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--delete", action="store_true")
    sys.exit(asyncio.run(main(ap.parse_args().delete)))
