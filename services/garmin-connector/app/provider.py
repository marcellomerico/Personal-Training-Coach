"""Provider-Abstraktion für den Garmin-Connector: Stub vs. Real.

Die HTTP-Endpunkte bedienen ein gemeinsames Interface, egal ob Stub- oder
echter Modus. Der Stub liefert deterministische Testdaten. Der Real-Provider
führt den echten Garmin-Login über `garth` aus (inkl. MFA/2FA über den
zweistufigen start/complete-Flow) und gibt die Session-Tokens an die API
zurück, die sie verschlüsselt in `provider_accounts.secrets` speichert.

Sicherheit:
- Zugangsdaten kommen ausschliesslich aus der Umgebung (GARMIN_EMAIL/
  GARMIN_PASSWORD), nie über die HTTP-Schnittstelle.
- Das Passwort wird **nicht** gespeichert und **nicht** geloggt.
- Datenabruf (activities/daily-health/sleep) im Real-Modus folgt separat
  (feat/garmin-real-data-mapping).
"""

from __future__ import annotations

import importlib.util
import logging
import os
import time
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException

from . import stub_data

logger = logging.getLogger("garmin-connector.provider")


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
    """Echter Garmin-Login über garth (inkl. MFA), zweistufig start/complete.

    `start_auth` startet den Login mit den Umgebungs-Zugangsdaten. Verlangt
    Garmin MFA, wird der Login-Zwischenzustand unter einer challengeId zwischen-
    gespeichert; `complete_auth` schliesst ihn mit dem Code ab und liefert die
    Session-Tokens. Datenabruf folgt in feat/garmin-real-data-mapping.
    """

    mode = "real"
    REQUIRED_PACKAGES = ("garth", "garminconnect")
    REQUIRED_CREDENTIALS = ("GARMIN_EMAIL", "GARMIN_PASSWORD")
    CHALLENGE_TTL_SEC = 10 * 60

    def __init__(self) -> None:
        self.missing_packages = [
            pkg for pkg in self.REQUIRED_PACKAGES if importlib.util.find_spec(pkg) is None
        ]
        # Login-Zwischenzustände (MFA) je challengeId; nur im Prozess, kurzlebig.
        self._challenges: dict[str, dict] = {}

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

    def _prune_challenges(self) -> None:
        now = time.monotonic()
        expired = [cid for cid, c in self._challenges.items() if c["expires"] < now]
        for cid in expired:
            self._challenges.pop(cid, None)

    @staticmethod
    def _session_to_secrets(garth_client) -> dict:
        """Serialisiert die garth-Session als Token-String (kein Passwort)."""
        token = garth_client.dumps()
        return {
            "mode": "real",
            "provider": "garth",
            "session": token,
            "issuedAt": _iso(datetime.now(timezone.utc)),
        }

    @staticmethod
    def _external_user_id(garth_client) -> str:
        # garth.client.username ist der Garmin-Connect-Benutzername.
        username = getattr(garth_client, "username", None)
        if not username:
            profile = getattr(garth_client, "profile", None) or {}
            username = profile.get("userName") or profile.get("displayName")
        return str(username) if username else "garmin-user"

    def start_auth(self, email: Optional[str]) -> dict:
        self._ensure_ready()
        self._prune_challenges()

        import garth  # lokal, da optionales Paket

        garmin_email = os.environ["GARMIN_EMAIL"]
        garmin_password = os.environ["GARMIN_PASSWORD"]

        try:
            # return_on_mfa=True -> garth bricht vor der MFA ab und gibt den
            # Zwischenzustand zurück, statt interaktiv zu fragen.
            result = garth.login(garmin_email, garmin_password, return_on_mfa=True)
        except Exception as err:  # noqa: BLE001 - Fehler kontrolliert melden
            # Wichtig: niemals Passwort/E-Mail in die Fehlermeldung aufnehmen.
            logger.warning("Garmin-Login fehlgeschlagen: %s", type(err).__name__)
            raise HTTPException(
                status_code=502,
                detail="Garmin-Login fehlgeschlagen (Zugangsdaten oder Garmin-Antwort prüfen).",
            ) from None

        challenge_id = f"real-{uuid4().hex}"
        expires = time.monotonic() + self.CHALLENGE_TTL_SEC
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=self.CHALLENGE_TTL_SEC)

        needs_mfa = isinstance(result, dict) and result.get("needs_mfa")
        if needs_mfa:
            self._challenges[challenge_id] = {
                "client_state": result["client_state"],
                "expires": expires,
            }
            message = "Garmin-MFA erforderlich. 2FA-Code senden, um den Login abzuschliessen."
        else:
            # Kein MFA nötig: Login ist bereits abgeschlossen (result = oauth-Tupel).
            self._challenges[challenge_id] = {
                "completed": True,
                "expires": expires,
            }
            message = "Garmin-Login ohne MFA abgeschlossen. /auth/complete zum Finalisieren aufrufen."

        return {
            "mode": "real",
            "mfaRequired": bool(needs_mfa),
            "challengeId": challenge_id,
            "expiresAt": _iso(expires_at),
            "message": message,
        }

    def complete_auth(self, challenge_id: str, mfa_code: str) -> dict:
        self._ensure_ready()
        self._prune_challenges()

        import garth  # lokal, da optionales Paket

        challenge = self._challenges.get(challenge_id)
        if not challenge:
            raise HTTPException(
                status_code=400,
                detail="Unbekannte oder abgelaufene Challenge. Login neu starten.",
            )

        try:
            if not challenge.get("completed"):
                # MFA fortsetzen: schliesst den Login mit dem Code ab.
                garth.resume_login(challenge["client_state"], mfa_code)

            secrets = self._session_to_secrets(garth.client)
            external_user_id = self._external_user_id(garth.client)
        except HTTPException:
            raise
        except Exception as err:  # noqa: BLE001
            logger.warning("Garmin-MFA/Abschluss fehlgeschlagen: %s", type(err).__name__)
            raise HTTPException(
                status_code=502,
                detail="Garmin-Login-Abschluss fehlgeschlagen (MFA-Code oder Session prüfen).",
            ) from None
        finally:
            self._challenges.pop(challenge_id, None)

        return {
            "externalUserId": external_user_id,
            "displayName": external_user_id,
            "connectedAt": _iso(datetime.now(timezone.utc)),
            "secrets": secrets,
        }

    def _data_client(self):
        """garminconnect-Client auf Basis der bestehenden garth-Session."""
        from . import real_garmin

        try:
            return real_garmin.make_client()
        except Exception as err:  # noqa: BLE001
            logger.warning("Garmin-Datenclient nicht verfügbar: %s", type(err).__name__)
            raise HTTPException(
                status_code=502,
                detail="Garmin-Session nicht verfügbar. Zuerst /auth/start + /auth/complete ausführen.",
            ) from None

    def _fetch(self, kind: str, key: str, from_: str, to: str) -> dict:
        from . import real_garmin

        client = self._data_client()
        fetchers = {
            "activities": real_garmin.fetch_activities,
            "metrics": real_garmin.fetch_daily_health,
            "sleep": real_garmin.fetch_sleep,
        }
        try:
            return {key: fetchers[kind](client, from_, to)}
        except Exception as err:  # noqa: BLE001
            logger.warning("Garmin-%s-Abruf fehlgeschlagen: %s", kind, type(err).__name__)
            raise HTTPException(
                status_code=502,
                detail=f"Garmin-Datenabruf ({kind}) fehlgeschlagen.",
            ) from None

    def activities(self, seed: str, from_: str, to: str) -> dict:
        self._ensure_ready()
        return self._fetch("activities", "activities", from_, to)

    def daily_health(self, seed: str, from_: str, to: str) -> dict:
        self._ensure_ready()
        return self._fetch("metrics", "metrics", from_, to)

    def sleep(self, seed: str, from_: str, to: str) -> dict:
        self._ensure_ready()
        return self._fetch("sleep", "sleep", from_, to)


def is_stub_mode() -> bool:
    return os.getenv("GARMIN_STUB_MODE", "true").lower() != "false"


def get_provider() -> GarminProvider:
    """Wählt den Provider anhand von GARMIN_STUB_MODE (Default: Stub)."""
    return StubGarminProvider() if is_stub_mode() else RealGarminProvider()
