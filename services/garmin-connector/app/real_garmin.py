"""Echter Garmin-Datenabruf + Mapping auf die Connector-Schemas.

Nutzt die bereits per garth authentifizierte Session und die High-Level-
Methoden von `garminconnect`. Die Garmin-Antworten werden auf **dieselbe Form**
gemappt, die der Stub liefert (siehe `stub_data`) und die der TS-Connector per
Zod prüft (`packages/connectors/src/garmin/schemas.ts`).

Defensiv: fehlende Felder -> None, fehlerhafte Einzeleinträge werden
übersprungen statt den ganzen Sync zu kippen. Die genauen Garmin-Connect-
Feldnamen können je nach API-Stand abweichen – das Mapping ist bewusst tolerant.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

logger = logging.getLogger("garmin-connector.real")


def _date_range(from_: str, to: str) -> list[date]:
    start = datetime.strptime(from_, "%Y-%m-%d").date()
    end = datetime.strptime(to, "%Y-%m-%d").date()
    if end < start:
        start, end = end, start
    days = (end - start).days
    return [start + timedelta(days=i) for i in range(days + 1)]


def _int_or_none(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def _float_or_none(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _gmt_to_iso(value: Any) -> Optional[str]:
    """Garmin liefert GMT-Zeiten oft als 'YYYY-MM-DD HH:MM:SS' (ohne TZ)."""
    if not value:
        return None
    if isinstance(value, (int, float)):  # Millisekunden-Timestamp
        return (
            datetime.fromtimestamp(value / 1000, tz=timezone.utc)
            .isoformat()
            .replace("+00:00", "Z")
        )
    text = str(value).strip().replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            dt = datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
            return dt.isoformat().replace("+00:00", "Z")
        except ValueError:
            continue
    return None


def make_client(session: dict) -> Any:
    """Stellt einen garminconnect-Client aus der übergebenen Session her.

    Erwartet `session` aus den entschlüsselten Provider-Secrets:
    {
      "mode": "real",
      "provider": "garminconnect",
      "session": "<token-string aus client.dumps()>"
    }
    """
    from fastapi import HTTPException
    from garminconnect import Garmin

    token = session.get("session") if isinstance(session, dict) else None
    if not isinstance(token, str) or not token.strip():
        raise HTTPException(
            status_code=401,
            detail="Garmin-Session ist ungültig oder fehlt (session-token).",
        )

    garmin = Garmin()

    # API-Drift tolerant behandeln: je nach Version liegt der HTTP-Client auf
    # `garmin.client` oder auf `garmin.garth`.
    restored = False
    errors: list[str] = []

    client_obj = getattr(garmin, "client", None)
    if client_obj is not None and hasattr(client_obj, "loads"):
        try:
            client_obj.loads(token)
            restored = True
        except Exception as err:  # noqa: BLE001
            errors.append(type(err).__name__)

    if not restored:
        garth_obj = getattr(garmin, "garth", None)
        if garth_obj is not None and hasattr(garth_obj, "loads"):
            try:
                garth_obj.loads(token)
                restored = True
            except Exception as err:  # noqa: BLE001
                errors.append(type(err).__name__)

    if not restored:
        detail = "Garmin-Session konnte nicht wiederhergestellt werden."
        if errors:
            detail = f"{detail} ({', '.join(errors[:2])})"
        raise HTTPException(status_code=401, detail=detail)

    return garmin


# --- Aktivitäten -----------------------------------------------------------


def _map_activity(raw: dict) -> Optional[dict]:
    activity_id = raw.get("activityId")
    start = _gmt_to_iso(raw.get("startTimeGMT") or raw.get("startTimeLocal"))
    duration = _int_or_none(raw.get("duration"))
    if activity_id is None or start is None or duration is None:
        return None
    type_key = (raw.get("activityType") or {}).get("typeKey") or "unknown"
    return {
        "sourceExternalId": str(activity_id),
        "type": type_key,
        "startTime": start,
        "timezone": raw.get("timeZoneId") or raw.get("timeZoneUnitId") or None,
        "durationSec": max(duration, 0),
        "distanceM": _float_or_none(raw.get("distance")),
        "elevationGainM": _float_or_none(raw.get("elevationGain")),
        "avgHr": _int_or_none(raw.get("averageHR")),
        "maxHr": _int_or_none(raw.get("maxHR")),
        "avgPowerW": _int_or_none(raw.get("avgPower") or raw.get("averagePower")),
        "calories": _int_or_none(raw.get("calories")),
    }


def fetch_activities(client: Any, from_: str, to: str) -> list[dict]:
    raw_list = client.get_activities_by_date(from_, to) or []
    out: list[dict] = []
    for raw in raw_list:
        try:
            mapped = _map_activity(raw)
        except Exception as err:  # noqa: BLE001
            logger.warning("Aktivität übersprungen: %s", type(err).__name__)
            continue
        if mapped:
            out.append(mapped)
    return out


# --- Tagesgesundheit -------------------------------------------------------


def _map_daily_health(day_iso: str, stats: dict, hrv: Optional[dict]) -> dict:
    body_battery = (
        stats.get("bodyBatteryMostRecentValue")
        or stats.get("bodyBatteryHighestValue")
        or stats.get("highestBodyBattery")
    )
    hrv_value = None
    if hrv:
        summary = hrv.get("hrvSummary") or {}
        hrv_value = summary.get("lastNightAvg") or summary.get("weeklyAvg")
    return {
        "date": day_iso,
        "restingHr": _int_or_none(stats.get("restingHeartRate")),
        "hrv": _float_or_none(hrv_value),
        "steps": _int_or_none(stats.get("totalSteps")),
        "bodyBattery": _int_or_none(body_battery),
        "stressAvg": _int_or_none(stats.get("averageStressLevel")),
        "weightKg": None,
    }


def fetch_daily_health(client: Any, from_: str, to: str) -> list[dict]:
    out: list[dict] = []
    for day in _date_range(from_, to):
        day_iso = day.isoformat()
        try:
            stats = client.get_stats(day_iso) or {}
            hrv = None
            if hasattr(client, "get_hrv_data"):
                try:
                    hrv = client.get_hrv_data(day_iso)
                except Exception:  # noqa: BLE001 - HRV optional
                    hrv = None
            out.append(_map_daily_health(day_iso, stats, hrv))
        except Exception as err:  # noqa: BLE001
            logger.warning("Daily-Health %s übersprungen: %s", day_iso, type(err).__name__)
            continue
    return out


# --- Schlaf ----------------------------------------------------------------


def _map_sleep(day_iso: str, raw: dict) -> Optional[dict]:
    dto = raw.get("dailySleepDTO") or raw
    total = _int_or_none(dto.get("sleepTimeSeconds"))
    if total is None:
        return None
    scores = dto.get("sleepScores") or {}
    overall = scores.get("overall") or {}
    sleep_score = overall.get("value") if isinstance(overall, dict) else None
    if sleep_score is None:
        sleep_score = dto.get("sleepScoreValue")
    return {
        "date": day_iso,
        "sleepStart": _gmt_to_iso(dto.get("sleepStartTimestampGMT")),
        "sleepEnd": _gmt_to_iso(dto.get("sleepEndTimestampGMT")),
        "totalSleepSec": total,
        "deepSec": _int_or_none(dto.get("deepSleepSeconds")),
        "lightSec": _int_or_none(dto.get("lightSleepSeconds")),
        "remSec": _int_or_none(dto.get("remSleepSeconds")),
        "awakeSec": _int_or_none(dto.get("awakeSleepSeconds")),
        "sleepScore": _int_or_none(sleep_score),
    }


def fetch_sleep(client: Any, from_: str, to: str) -> list[dict]:
    out: list[dict] = []
    for day in _date_range(from_, to):
        day_iso = day.isoformat()
        try:
            raw = client.get_sleep_data(day_iso) or {}
            mapped = _map_sleep(day_iso, raw)
            if mapped:
                out.append(mapped)
        except Exception as err:  # noqa: BLE001
            logger.warning("Sleep %s übersprungen: %s", day_iso, type(err).__name__)
            continue
    return out
