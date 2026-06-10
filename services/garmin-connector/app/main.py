"""Garmin-Connector (Python, isoliert).

Phase 2: Stub-Modus mit deterministischen Daten, damit der gesamte Import-Pfad
(API -> Connector -> DB) ohne echten Garmin-Login end-to-end testbar ist.

Der echte Login (garth/garminconnect, inkl. MFA) und die Token-Persistenz folgen,
ohne dass sich dieses HTTP-Interface ändert.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field

from . import stub_data

STUB_MODE = os.getenv("GARMIN_STUB_MODE", "true").lower() != "false"
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY")

app = FastAPI(title="garmin-connector", version="0.2.0")


class AuthStartRequest(BaseModel):
    email: Optional[str] = None


class AuthCompleteRequest(BaseModel):
    challenge_id: str = Field(alias="challengeId")
    mfa_code: str = Field(alias="mfaCode", min_length=4, max_length=12)


def require_internal_key(x_internal_key: Optional[str] = Header(default=None)) -> None:
    """Schützt die Endpunkte mit dem Shared-Secret, falls eines gesetzt ist."""
    if INTERNAL_API_KEY and x_internal_key != INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="invalid internal key")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "garmin-connector", "stubMode": STUB_MODE}


@app.post("/auth/start", dependencies=[Depends(require_internal_key)])
def start_auth(body: AuthStartRequest) -> dict:
    if not STUB_MODE:
        raise HTTPException(status_code=501, detail="echter Garmin-Login noch nicht implementiert")
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    return {
        "mode": "stub",
        "mfaRequired": True,
        "challengeId": f"stub-{uuid4().hex}",
        "expiresAt": expires_at.isoformat().replace("+00:00", "Z"),
        "message": "Stub-MFA gestartet. Im Stub-Modus lautet der Code 000000.",
    }


@app.post("/auth/complete", dependencies=[Depends(require_internal_key)])
def complete_auth(body: AuthCompleteRequest) -> dict:
    if not STUB_MODE:
        raise HTTPException(status_code=501, detail="echter Garmin-Login noch nicht implementiert")
    if not body.challenge_id.startswith("stub-"):
        raise HTTPException(status_code=400, detail="ungueltige Stub-Challenge")
    if body.mfa_code != "000000":
        raise HTTPException(status_code=401, detail="ungueltiger Stub-MFA-Code")

    connected_at = datetime.now(timezone.utc)
    session_id = body.challenge_id.removeprefix("stub-")[:16]
    return {
        "externalUserId": f"stub-garmin-{session_id}",
        "displayName": "Garmin Stub Account",
        "connectedAt": connected_at.isoformat().replace("+00:00", "Z"),
        "secrets": {
            "mode": "stub",
            "sessionId": session_id,
            "issuedAt": connected_at.isoformat().replace("+00:00", "Z"),
            "note": "Stub-Session ohne echte Garmin-Zugangsdaten.",
        },
    }


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
