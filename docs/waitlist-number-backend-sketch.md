# Sketch — return the waitlist number from the database

**Goal.** The `/start`+home waitlist UI now shows a visitor their *waitlist number*
once they've registered (see `/js/auth-state.js`, `/js/main.js`). The frontend already
reads `data.number` from the API response and caches it in `localStorage`
(`tfx_waitlist`). This sketch wires the **backend** to actually return that number,
sourced from the database, so the number is authoritative rather than a local placeholder.

## Where

- Service: **`tracercoin-waitlist.service`** — FastAPI/uvicorn at
  `/opt/tracercoin-backend`, `app.main:app`, listening on `127.0.0.1:8081`.
- nginx proxies `location /api/ → http://127.0.0.1:8081` for `tracercoin.org`.
- DB: SQLite at `WAITLIST_DB_PATH` (default `/var/lib/tracercoin/waitlist.db`),
  table `signups` — already has the perfect key:

  ```sql
  CREATE TABLE signups (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,  -- << this is the waitlist number
      email      TEXT UNIQUE,
      phone      TEXT UNIQUE,
      is_account INTEGER NOT NULL DEFAULT 0,
      verified   INTEGER NOT NULL DEFAULT 0,
      source     TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
  );
  ```

**The waitlist number = `signups.id`.** No schema change needed. (`lastrowid` is
unreliable with `ON CONFLICT DO UPDATE`, so read the id back with a `SELECT`.)

## Change 1 — `POST /api/waitlist`, email lane (`app/main.py`)

The email lane already upserts. Capture the id and return it:

```python
number = None
if email:
    with db() as conn:
        conn.execute(
            """INSERT INTO signups (email, source, created_at, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(email) DO UPDATE SET updated_at=excluded.updated_at""",
            (email, body.source, ts, ts),
        )
        row = conn.execute("SELECT id FROM signups WHERE email=?", (email,)).fetchone()
        number = row[0] if row else None

# ...phone lane unchanged (still returns {"verification": "pending"}; the number
#    is assigned on verify, below)...

# Email-only signup: done — now include the number.
return {"ok": True, "verification": "none", "number": number}
```

## Change 2 — `POST /api/verify`, phone lane (`app/main.py`)

After the verified upsert, read the id back and return it:

```python
with db() as conn:
    conn.execute(
        """INSERT INTO signups (phone, is_account, verified, source, created_at, updated_at)
           VALUES (?, 1, 1, 'tracercoin.org', ?, ?)
           ON CONFLICT(phone) DO UPDATE SET verified=1, is_account=1, updated_at=excluded.updated_at""",
        (phone, ts, ts),
    )
    row = conn.execute("SELECT id FROM signups WHERE phone=?", (phone,)).fetchone()
    number = row[0] if row else None
return {"ok": True, "verified": True, "number": number}
```

That's the whole change for the number. The frontend's `numberFrom()` already accepts
`number` (and falls back to `position`/`id`), so nothing else is required client-side.

## Change 3 (optional) — a status route for return visits

Today the frontend re-shows the number from the `localStorage` cache. If you'd rather it
re-fetch from the DB (e.g. after clearing storage, or on another device once accounts
have a session), add a read route and have `auth-state.js` call it when it holds a portal
token:

```python
@app.get("/api/waitlist/status")
def waitlist_status(email: str | None = None, phone: str | None = None):
    key, val = ("email", email) if email else ("phone", normalize_phone(phone or ""))
    if not val:
        raise HTTPException(400, "Provide an email or phone.")
    with db() as conn:
        row = conn.execute(
            f"SELECT id, verified FROM signups WHERE {key}=?", (val,)
        ).fetchone()
    if not row:
        return {"on_list": False}
    return {"on_list": True, "number": row[0], "verified": bool(row[1])}
```

(Only expose this if you're comfortable with membership being queryable by
email/phone; otherwise keep it behind the portal bearer token.)

## Nice-to-have — a friendlier number

`id` starts at 1. If you want the displayed number to look less "early", return
`1000 + id` (or any offset) from the routes — it stays stable and monotonic. Purely
cosmetic; the frontend renders whatever integer it's given as `#<number>`.

## Deploy

Edit `/opt/tracercoin-backend/app/main.py`, then:

```bash
systemctl restart tracercoin-waitlist.service
curl -s -X POST https://tracercoin.org/api/waitlist \
  -H 'Content-Type: application/json' -d '{"email":"probe@example.com"}'
# expect: {"ok":true,"verification":"none","number":<int>}
```
