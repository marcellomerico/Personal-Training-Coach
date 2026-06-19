"""Provider-Abstraktion für den Garmin-Connector: Stub vs. Real.

Die HTTP-Endpunkte bedienen ein gemeinsames Interface, egal ob Stub- oder
echter Modus. Der Stub liefert deterministische Testdaten. Der Real-Provider
führt den echten Garmin-Login über `garminconnect` aus (inkl. MFA/2FA über den
zweistufigen start/complete-Flow) und gibt die Session-Tokens an die API
zurück, die sie verschlüsselt in `provider_accounts.secrets` speichert.

Sicherheit:
- Zugangsdaten kommen ausschliesslich aus der Umgebung (GARMIN_EMAIL/
  GARMIN_PASSWORD), nie über die HTTP-Schnittstelle.
- Das Passwort wird **nicht** gespeichert und **nicht** geloggt.
- Datenabruf (activities/daily-health/sleep) nutzt die übergebene Session aus
  `provider_accounts.secrets` und läuft zustandslos pro Request.
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
    def activities(self, seed: str, from_: str, to: str, session: Optional[dict]) -> dict: ...

    @abstractmethod
    def daily_health(self, seed: str, from_: str, to: str, session: Optional[dict]) -> dict: ...

    @abstractmethod
    def sleep(self, seed: str, from_: str, to: str, session: Optional[dict]) -> dict: ...


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
            "mode": "stub",
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

    # Der Stub ignoriert die Session (deterministische Daten je seed).
    def activities(self, seed: str, from_: str, to: str, session: Optional[dict]) -> dict:
        return {"activities": stub_data.activities(seed, from_, to)}

    def daily_health(self, seed: str, from_: str, to: str, session: Optional[dict]) -> dict:
        return {"metrics": stub_data.daily_health(seed, from_, to)}

    def sleep(self, seed: str, from_: str, to: str, session: Optional[dict]) -> dict:
        return {"sleep": stub_data.sleep(seed, from_, to)}


class RealGarminProvider(GarminProvider):
    """Echter Garmin-Login über garminconnect (inkl. MFA), zweistufig start/complete.

    `start_auth` startet den Login mit den Umgebungs-Zugangsdaten. Verlangt
    Garmin MFA, wird der Login-Zwischenzustand unter einer challengeId zwischen-
    gespeichert; `complete_auth` schliesst ihn mit dem Code ab und liefert die
    Session-Tokens. Datenabruf folgt in feat/garmin-real-data-mapping.
    """

    mode = "real"
    REQUIRED_PACKAGES = ("garminconnect",)
    REQUIRED_CREDENTIALS = ("GARMIN_EMAIL", "GARMIN_PASSWORD")
    CHALLENGE_TTL_SEC = 10 * 60

    def __init__(self) -> None:
        self.missing_packages = [
            pkg for pkg in self.REQUIRED_PACKAGES if importlib.util.find_spec(pkg) is None
        ]
        # In-Memory MFA-Challenges (prozesslokal; bei multi-worker ggf. externisieren).
        self._challenges: dict[str, dict] = {}

    def _ensure_ready(self) -> None:
        if self.missing_packages:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Garmin Real-Modus nicht einsatzbereit: Python-Pakete "
                    f"{', '.join(self.missing_packages)} sind nicht installiert. "
                    "In services/garmin-connector installieren (siehe README, "
                    "Abschnitt 'Echter Login (garminconnect)')."
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
        expired = [cid for cid, challenge in self._challenges.items() if challenge["expires"] < now]
        for cid in expired:
            self._challenges.pop(cid, None)

    @staticmethod
    def _safe_error_label(err: Exception) -> str:
        return type(err).__name__

    @staticmethod
    def _session_to_secrets(garmin_api) -> dict:
        # Native Session aus garminconnect internem Client serialisieren.
        token = garmin_api.client.dumps()
        return {
            "mode": "real",
            "provider": "garminconnect",
            "session": token,
            "issuedAt": _iso(datetime.now(timezone.utc)),
        }

    @staticmethod
    def _external_user_id(garmin_api) -> str:
        # display_name wird von garminconnect nach Login gesetzt.
        display_name = getattr(garmin_api, "display_name", None)
        username = getattr(garmin_api, "username", None)
        value = display_name or username
        return str(value) if value else "garmin-user"

    def start_auth(self, email: Optional[str]) -> dict:
        self._ensure_ready()
        self._prune_challenges()
        # Sicherheit: niemals HTTP-email als Credential übernehmen.
        if email:
            logger.info("Real-Login verwendet GARMIN_EMAIL aus Env; Request-email wird ignoriert.")

        from garminconnect import Garmin
        from garminconnect import (
            GarminConnectAuthenticationError,
            GarminConnectConnectionError,
            GarminConnectTooManyRequestsError,
        )

        garmin_email = os.environ["GARMIN_EMAIL"]
        garmin_password = os.environ["GARMIN_PASSWORD"]
        garmin = Garmin(
            email=garmin_email,
            password=garmin_password,
            return_on_mfa=True,
        )

        try:
            login_result = garmin.login()
        except GarminConnectTooManyRequestsError:
            raise HTTPException(
                status_code=429,
                detail="Zu viele Garmin-Login-Versuche. Bitte später erneut versuchen.",
            ) from None
        except (GarminConnectAuthenticationError, GarminConnectConnectionError) as err:
            logger.warning("Garmin-Login start fehlgeschlagen: %s", self._safe_error_label(err))
            raise HTTPException(
                status_code=502,
                detail="Garmin-Login konnte nicht gestartet werden (Authentifizierung/Verbindung).",
            ) from None
        except Exception as err:  # noqa: BLE001
            logger.warning("Garmin-Login start fehlgeschlagen: %s", self._safe_error_label(err))
            raise HTTPException(status_code=502, detail="Garmin-Login Start fehlgeschlagen.") from None

        mfa_status = None
        client_state = None
        if isinstance(login_result, tuple):
            mfa_status, client_state = login_result
        elif isinstance(login_result, str):
            mfa_status = login_result
        needs_mfa = mfa_status == "needs_mfa"

        challenge_id = f"real-{uuid4().hex}"
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=self.CHALLENGE_TTL_SEC)
        challenge: dict = {
            "garmin": garmin,
            "expires": time.monotonic() + self.CHALLENGE_TTL_SEC,
            "completed": not needs_mfa,
        }
        if needs_mfa:
            if not isinstance(client_state, dict):
                raise HTTPException(
                    status_code=502,
                    detail="Garmin verlangt MFA, aber es wurde kein Login-Zwischenzustand geliefert.",
                )
            challenge["client_state"] = client_state
        self._challenges[challenge_id] = challenge

        return {
            "mode": "real",
            "mfaRequired": needs_mfa,
            "challengeId": challenge_id,
            "expiresAt": _iso(expires_at),
            "message": (
                "Garmin-MFA erforderlich. Bitte 2FA-Code senden."
                if needs_mfa
                else "Garmin-Login gestartet. Kein MFA erforderlich; mit /auth/complete fortfahren."
            ),
        }

    def complete_auth(self, challenge_id: str, mfa_code: str) -> dict:
        self._ensure_ready()
        self._prune_challenges()
        challenge = self._challenges.get(challenge_id)
        if not challenge:
            raise HTTPException(
                status_code=400,
                detail="Unbekannte oder abgelaufene Challenge. Login bitte neu starten.",
            )

        from garminconnect import (
            GarminConnectAuthenticationError,
            GarminConnectConnectionError,
            GarminConnectTooManyRequestsError,
        )

        garmin = challenge["garmin"]
        try:
            if not challenge.get("completed"):
                garmin.resume_login(challenge["client_state"], mfa_code)
            secrets = self._session_to_secrets(garmin)
            external_user_id = self._external_user_id(garmin)
        except GarminConnectTooManyRequestsError:
            raise HTTPException(
                status_code=429,
                detail="Zu viele Garmin-MFA-Versuche. Bitte später erneut versuchen.",
            ) from None
        except (GarminConnectAuthenticationError, GarminConnectConnectionError) as err:
            logger.warning("Garmin-Login complete fehlgeschlagen: %s", self._safe_error_label(err))
            raise HTTPException(
                status_code=502,
                detail="Garmin-Login-Abschluss fehlgeschlagen (MFA/Session prüfen).",
            ) from None
        except Exception as err:  # noqa: BLE001
            logger.warning("Garmin-Login complete fehlgeschlagen: %s", self._safe_error_label(err))
            raise HTTPException(status_code=502, detail="Garmin-Login Abschluss fehlgeschlagen.") from None
        finally:
            self._challenges.pop(challenge_id, None)

        return {
            "mode": "real",
            "externalUserId": external_user_id,
            "displayName": external_user_id,
            "connectedAt": _iso(datetime.now(timezone.utc)),
            "secrets": secrets,
        }

    def _require_session(self, session: Optional[dict]) -> dict:
        if not session:
            raise HTTPException(
                status_code=401,
                detail=(
                    "Garmin-Session fehlt. Die API muss die entschlüsselte Session "
                    "(x-garmin-session) mitsenden – zuerst Auth abschliessen."
                ),
            )
        return session

    def _fetch(self, kind: str, key: str, from_: str, to: str, session: Optional[dict]) -> dict:
        from . import real_garmin

        session = self._require_session(session)
        # make_client stellt die garminconnect-Session aus `session` wieder her.
        client = real_garmin.make_client(session)
        fetchers = {
            "activities": real_garmin.fetch_activities,
            "metrics": real_garmin.fetch_daily_health,
            "sleep": real_garmin.fetch_sleep,
        }
        try:
            return {key: fetchers[kind](client, from_, to)}
        except HTTPException:
            raise
        except Exception as err:  # noqa: BLE001
            logger.warning("Garmin-%s-Abruf fehlgeschlagen: %s", kind, type(err).__name__)
            raise HTTPException(
                status_code=502,
                detail=f"Garmin-Datenabruf ({kind}) fehlgeschlagen.",
            ) from None

    def activities(self, seed: str, from_: str, to: str, session: Optional[dict]) -> dict:
        self._ensure_ready()
        return self._fetch("activities", "activities", from_, to, session)

    def daily_health(self, seed: str, from_: str, to: str, session: Optional[dict]) -> dict:
        self._ensure_ready()
        return self._fetch("metrics", "metrics", from_, to, session)

    def sleep(self, seed: str, from_: str, to: str, session: Optional[dict]) -> dict:
        self._ensure_ready()
        return self._fetch("sleep", "sleep", from_, to, session)


def is_stub_mode() -> bool:
    return os.getenv("GARMIN_STUB_MODE", "true").lower() != "false"


def get_provider() -> GarminProvider:
    """Wählt den Provider anhand von GARMIN_STUB_MODE (Default: Stub)."""
    return StubGarminProvider() if is_stub_mode() else RealGarminProvider()
