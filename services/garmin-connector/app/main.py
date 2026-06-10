"""Garmin-Connector (Python, isoliert).

Die HTTP-Endpunkte delegieren an einen Provider (Stub oder Real, siehe
`provider.py`). Im Stub-Modus liefert der Connector deterministische Daten,
damit der gesamte Import-Pfad (API -> Connector -> DB) ohne echten Garmin-Login
end-to-end testbar ist. Der echte Login (garth/garminconnect, inkl. MFA) wird
im Real-Provider ergänzt, ohne dass sich dieses HTTP-Interface ändert.
"""

import os
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field

from .provider import get_provider, is_stub_mode

INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY")

app = FastAPI(title="garmin-connector", version="0.3.0")

# Provider einmal beim Start anhand GARMIN_STUB_MODE auswählen.
provider = get_provider()


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
    return {
        "status": "ok",
        "service": "garmin-connector",
        "stubMode": is_stub_mode(),
        "providerMode": provider.mode,
    }


@app.post("/auth/start", dependencies=[Depends(require_internal_key)])
def start_auth(body: AuthStartRequest) -> dict:
    return provider.start_auth(body.email)


@app.post("/auth/complete", dependencies=[Depends(require_internal_key)])
def complete_auth(body: AuthCompleteRequest) -> dict:
    return provider.complete_auth(body.challenge_id, body.mfa_code)


@app.get("/activities", dependencies=[Depends(require_internal_key)])
def get_activities(
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    seed: str = Query("default"),
) -> dict:
    return provider.activities(seed, from_, to)


@app.get("/daily-health", dependencies=[Depends(require_internal_key)])
def get_daily_health(
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    seed: str = Query("default"),
) -> dict:
    return provider.daily_health(seed, from_, to)


@app.get("/sleep", dependencies=[Depends(require_internal_key)])
def get_sleep(
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    seed: str = Query("default"),
) -> dict:
    return provider.sleep(seed, from_, to)
