"""Deterministische Stub-Daten für die Phase-2-Entwicklung.

Erzeugt reproduzierbare, plausible Garmin-ähnliche Daten ohne echten Login.
Der echte Connector (garth/garminconnect) ersetzt dieses Modul später, ohne
dass sich das HTTP-Interface ändert.
"""

import hashlib
import random
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List


def _rng(*parts: object) -> random.Random:
    raw = "|".join(str(p) for p in parts).encode("utf-8")
    digest = hashlib.sha256(raw).hexdigest()
    return random.Random(int(digest[:16], 16))


def _date_range(from_: str, to: str) -> List[date]:
    start = datetime.strptime(from_, "%Y-%m-%d").date()
    end = datetime.strptime(to, "%Y-%m-%d").date()
    if end < start:
        start, end = end, start
    days = (end - start).days
    return [start + timedelta(days=i) for i in range(days + 1)]


def daily_health(seed: str, from_: str, to: str) -> List[Dict]:
    out: List[Dict] = []
    for day in _date_range(from_, to):
        r = _rng(seed, "health", day.isoformat())
        out.append(
            {
                "date": day.isoformat(),
                "restingHr": r.randint(46, 60),
                "hrv": round(r.uniform(40.0, 95.0), 1),
                "steps": r.randint(3000, 16000),
                "bodyBattery": r.randint(25, 100),
                "stressAvg": r.randint(20, 60),
                "weightKg": round(r.uniform(68.0, 75.0), 1),
            }
        )
    return out


def sleep(seed: str, from_: str, to: str) -> List[Dict]:
    out: List[Dict] = []
    for day in _date_range(from_, to):
        r = _rng(seed, "sleep", day.isoformat())
        total = r.randint(5 * 3600, 9 * 3600)
        deep = int(total * r.uniform(0.12, 0.22))
        rem = int(total * r.uniform(0.18, 0.28))
        awake = r.randint(5 * 60, 40 * 60)
        light = max(total - deep - rem, 0)
        # Schlaf beginnt am Vorabend (~22:00-00:30) und endet am Stichtag.
        start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc) - timedelta(
            hours=r.randint(6, 9), minutes=r.randint(0, 59)
        )
        end = start + timedelta(seconds=total + awake)
        out.append(
            {
                "date": day.isoformat(),
                "sleepStart": start.isoformat().replace("+00:00", "Z"),
                "sleepEnd": end.isoformat().replace("+00:00", "Z"),
                "totalSleepSec": total,
                "deepSec": deep,
                "lightSec": light,
                "remSec": rem,
                "awakeSec": awake,
                "sleepScore": r.randint(45, 95),
            }
        )
    return out


_ACTIVITY_TYPES = ["run", "ride", "swim", "strength", "walk"]


def activities(seed: str, from_: str, to: str) -> List[Dict]:
    out: List[Dict] = []
    for day in _date_range(from_, to):
        r = _rng(seed, "activity", day.isoformat())
        # ~60% der Tage haben eine Aktivität.
        if r.random() > 0.6:
            continue
        act_type = r.choice(_ACTIVITY_TYPES)
        duration = r.randint(20 * 60, 120 * 60)
        start = datetime(
            day.year, day.month, day.day, r.randint(6, 19), r.randint(0, 59),
            tzinfo=timezone.utc,
        )
        distance = None
        elevation = None
        power = None
        if act_type in ("run", "ride", "walk", "swim"):
            speed = {"run": 3.0, "ride": 7.5, "walk": 1.4, "swim": 1.1}[act_type]
            distance = round(duration * speed * r.uniform(0.85, 1.15), 1)
            elevation = round(r.uniform(0, 600), 1) if act_type in ("run", "ride") else 0.0
        if act_type == "ride":
            power = r.randint(140, 260)
        out.append(
            {
                "sourceExternalId": f"stub-{seed}-{day.isoformat()}-{act_type}",
                "type": act_type,
                "startTime": start.isoformat().replace("+00:00", "Z"),
                "timezone": "Europe/Berlin",
                "durationSec": duration,
                "distanceM": distance,
                "elevationGainM": elevation,
                "avgHr": r.randint(110, 165),
                "maxHr": r.randint(165, 190),
                "avgPowerW": power,
                "calories": r.randint(200, 1200),
            }
        )
    return out
