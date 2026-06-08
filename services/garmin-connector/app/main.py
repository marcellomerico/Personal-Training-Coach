"""Garmin-Connector (Python, isoliert).

Phase 2: Stub-Modus mit deterministischen Daten, damit der gesamte Import-Pfad
(API -> Connector -> DB) ohne echten Garmin-Login end-to-end testbar ist.

Der echte Login (garth/garminconnect, inkl. MFA) und die Token-Persistenz folgen,
ohne dass sich dieses HTTP-Interface ändert.
"""

import os
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query

from . import stub_data

STUB_MODE = os.getenv("GARMIN_STUB_MODE", "true").lower() != "false"
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY")

app = FastAPI(title="garmin-connector", version="0.2.0")


def require_internal_key(x_internal_key: Optional[str] = Header(default=None)) -> None:
    """Schützt die Endpunkte mit dem Shared-Secret, falls eines gesetzt ist."""
    if INTERNAL_API_KEY and x_internal_key != INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="invalid internal key")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "garmin-connector", "stubMode": STUB_MODE}


@app.get("/activities", dependencies=[Depends(require_internal_key)])
def get_activities(
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    seed: str = Query("default"),
) -> dict:
    if not STUB_MODE:
        raise HTTPException(status_code=501, detail="echter Garmin-Login noch nicht implementiert")
    return {"activities": stub_data.activities(seed, from_, to)}


@app.get("/daily-health", dependencies=[Depends(require_internal_key)])
def get_daily_health(
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    seed: str = Query("default"),
) -> dict:
    if not STUB_MODE:
        raise HTTPException(status_code=501, detail="echter Garmin-Login noch nicht implementiert")
    return {"metrics": stub_data.daily_health(seed, from_, to)}


@app.get("/sleep", dependencies=[Depends(require_internal_key)])
def get_sleep(
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    seed: str = Query("default"),
) -> dict:
    if not STUB_MODE:
        raise HTTPException(status_code=501, detail="echter Garmin-Login noch nicht implementiert")
    return {"sleep": stub_data.sleep(seed, from_, to)}
