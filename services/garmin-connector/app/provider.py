"""Provider-Abstraktion für den Garmin-Connector: Stub vs. Real.

Ziel dieses Schritts (Foundation): die HTTP-Endpunkte bedienen ein gemeinsames
Interface, egal ob im Stub- oder im echten Modus. Der Stub liefert wie bisher
deterministische Testdaten. Der Real-Provider ist die Grundstruktur für den
echten garth/garminconnect-Login (Implementierung folgt separat) und liefert
**kontrollierte, verständliche Fehler**, wenn Pakete oder Zugangsdaten fehlen –
statt kryptischer Tracebacks oder eines nackten HTTP 501.
"""

from __future__ import annotations

import importlib.util
import os
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException

from . import stub_data


def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


class GarminProvider(ABC):
    """Gemeinsames Interface für Stub- und Real-Connector."""

    mode: str

    @abstractmethod
    def start_auth(self, email: Optional[str]) -> dict: ...

    @abstractmethod
    def complete_auth(self, challenge_id: str, mfa_code: str) -> dict: ...

    @abstractmethod
    def activities(self, seed: str, from_: str, to: str) -> dict: ...

    @abstractmethod
    def daily_health(self, seed: str, from_: str, to: str) -> dict: ...

    @abstractmethod
    def sleep(self, seed: str, from_: str, to: str) -> dict: ...


class StubGarminProvider(GarminProvider):
    """Deterministische Testdaten – unverändertes Verhalten aus Phase 2."""

    mode = "stub"

    def start_auth(self, email: Optional[str]) -> dict:
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
        return {
            "mode": "stub",
            "mfaRequired": True,
            "challengeId": f"stub-{uuid4().hex}",
            "expiresAt": _iso(expires_at),
            "message": "Stub-MFA gestartet. Im Stub-Modus lautet der Code 000000.",
        }

    def complete_auth(self, challenge_id: str, mfa_code: str) -> dict:
        if not challenge_id.startswith("stub-"):
            raise HTTPException(status_code=400, detail="ungueltige Stub-Challenge")
        if mfa_code != "000000":
            raise HTTPException(status_code=401, detail="ungueltiger Stub-MFA-Code")

        connected_at = datetime.now(timezone.utc)
        session_id = challenge_id.removeprefix("stub-")[:16]
        return {
            "externalUserId": f"stub-garmin-{session_id}",
            "displayName": "Garmin Stub Account",
            "connectedAt": _iso(connected_at),
            "secrets": {
                "mode": "stub",
                "sessionId": session_id,
                "issuedAt": _iso(connected_at),
                "note": "Stub-Session ohne echte Garmin-Zugangsdaten.",
            },
        }

    def activities(self, seed: str, from_: str, to: str) -> dict:
        return {"activities": stub_data.activities(seed, from_, to)}

    def daily_health(self, seed: str, from_: str, to: str) -> dict:
        return {"metrics": stub_data.daily_health(seed, from_, to)}

    def sleep(self, seed: str, from_: str, to: str) -> dict:
        return {"sleep": stub_data.sleep(seed, from_, to)}


class RealGarminProvider(GarminProvider):
    """Grundstruktur für den echten Login (garth/garminconnect).

    Implementiert noch keinen Login – stellt aber sicher, dass jeder Aufruf mit
    einer klaren Fehlermeldung endet: erst Pakete prüfen, dann Zugangsdaten,
    dann der Hinweis, dass die eigentliche Umsetzung noch aussteht.
    """

    mode = "real"
    REQUIRED_PACKAGES = ("garth", "garminconnect")
    REQUIRED_CREDENTIALS = ("GARMIN_EMAIL", "GARMIN_PASSWORD")

    def __init__(self) -> None:
        self.missing_packages = [
            pkg for pkg in self.REQUIRED_PACKAGES if importlib.util.find_spec(pkg) is None
        ]

    def _ensure_ready(self) -> None:
        if self.missing_packages:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Garmin Real-Modus nicht einsatzbereit: Python-Pakete "
                    f"{', '.join(self.missing_packages)} sind nicht installiert. "
                    "In services/garmin-connector installieren (siehe README, "
                    "Abschnitt 'Echter Login (garth/garminconnect)')."
                ),
            )
        missing_creds = [k for k in self.REQUIRED_CREDENTIALS if not os.getenv(k)]
        if missing_creds:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Garmin Real-Modus: Zugangsdaten fehlen "
                    f"({', '.join(missing_creds)}). Nur lokal in der Umgebung "
                    "setzen, niemals committen oder loggen."
                ),
            )

    def _not_implemented(self) -> dict:
        raise HTTPException(
            status_code=501,
            detail=(
                "Garmin Real-Login ist strukturell vorbereitet, aber noch nicht "
                "implementiert. Der echte garth/garminconnect-Login folgt im "
                "nächsten Schritt (feat/garmin-real-login)."
            ),
        )

    def start_auth(self, email: Optional[str]) -> dict:
        self._ensure_ready()
        return self._not_implemented()

    def complete_auth(self, challenge_id: str, mfa_code: str) -> dict:
        self._ensure_ready()
        return self._not_implemented()

    def activities(self, seed: str, from_: str, to: str) -> dict:
        self._ensure_ready()
        return self._not_implemented()

    def daily_health(self, seed: str, from_: str, to: str) -> dict:
        self._ensure_ready()
        return self._not_implemented()

    def sleep(self, seed: str, from_: str, to: str) -> dict:
        self._ensure_ready()
        return self._not_implemented()


def is_stub_mode() -> bool:
    return os.getenv("GARMIN_STUB_MODE", "true").lower() != "false"


def get_provider() -> GarminProvider:
    """Wählt den Provider anhand von GARMIN_STUB_MODE (Default: Stub)."""
    return StubGarminProvider() if is_stub_mode() else RealGarminProvider()
