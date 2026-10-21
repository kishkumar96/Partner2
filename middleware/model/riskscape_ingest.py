"""Fetch a finished RiskScape run through its guest (share) link and make its outputs importable.

A share link (https://riskscape.nz/shared/results/<token>) is a read-only credential for one
run. Its token can be exchanged for a session at /api/model-runs/guest-link/auth, which then
reads the run and downloads its outputs, without owning the run. `ingest_riskscape_run` uses
this to do what a person would otherwise do by hand before `import_ref_run`.
"""

import re
import sqlite3
from urllib.parse import unquote, urlparse

import requests
from pyproj import Transformer
from shapely import force_2d, from_wkb
from shapely.geometry import mapping
from shapely.ops import transform

from .queueing import storm_name

DEFAULT_RISKSCAPE_URL = "https://riskscape.nz"
TIMEOUT = 60
DOWNLOAD_TIMEOUT = 600

MEDIA_SUFFIXES = {
    "application/geo+json": ".geojson",
    "text/csv": ".csv",
    "application/geopackage+sqlite3": ".gpkg",
}
# GeoPackage envelope sizes by the indicator in the header flags
_ENVELOPE_BYTES = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}


class RiskScapeError(Exception):
    """The run can't be read or isn't ready to import."""


def http_get(url, **kwargs):
    """Plain GET, here so tests can replace the network."""
    kwargs.setdefault("timeout", TIMEOUT)
    return requests.get(url, **kwargs)


def share_token(value: str) -> str:
    """The token from a share link, or the value itself when it is already a bare token."""
    value = value.strip()
    if "://" not in value:
        return unquote(value)
    match = re.search(r"/shared/results/([^/?#]+)", urlparse(value).path)
    if not match:
        raise RiskScapeError(f"Not a RiskScape share link: {value}")
    return unquote(match.group(1))


class RiskScapeGuest:
    """A guest session on one shared run."""

    def __init__(self, base_url: str, token: str, session=None):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.session = session or requests.Session()
        self.cookie = None

    def open(self) -> dict:
        """The run behind the link: its id, state, parameters and outputs."""
        response = self.session.post(
            f"{self.base_url}/api/model-runs/guest-link/auth",
            data=self.token.encode("utf-8"),
            headers={"Content-Type": "text/plain", "Accept": "application/json"},
            timeout=TIMEOUT,
        )
        if response.status_code != 200:
            raise RiskScapeError(f"RiskScape refused the link (HTTP {response.status_code}).")
        # The cookie has an empty Domain, which a cookie jar drops, so keep it by hand
        match = re.search(r"rs-session=([^;,\s]+)", response.headers.get("Set-Cookie", ""))
        if not match:
            raise RiskScapeError("RiskScape gave no session for the link.")
        self.cookie = f"rs-session={match.group(1)}"
        return response.json()

    def download(self, output: dict, destination) -> None:
        response = self.session.get(
            f"{self.base_url}{output['uri']}/download",
            headers={"Cookie": self.cookie},
            stream=True,
            timeout=DOWNLOAD_TIMEOUT,
        )
        if response.status_code != 200:
            raise RiskScapeError(f"Couldn't download {output.get('name')} (HTTP {response.status_code}).")
        with open(destination, "wb") as handle:
            for chunk in response.iter_content(chunk_size=1 << 16):
                handle.write(chunk)


def convert_geopackage(path) -> dict:
    """A GeoPackage layer as a lon/lat GeoJSON FeatureCollection.

    RiskScape writes its overlays in the model's projection (EPSG:3832, a Pacific-centred
    Mercator); the dashboard and `import_ref_run` read lon/lat GeoJSON.
    """
    db = sqlite3.connect(path)
    try:
        table, geometry_column, srs_id = db.execute(
            "SELECT table_name, column_name, srs_id FROM gpkg_geometry_columns"
        ).fetchone()
        columns = [row[1] for row in db.execute(f'PRAGMA table_info("{table}")')]
        rows = db.execute(f'SELECT * FROM "{table}"').fetchall()
    finally:
        db.close()

    if srs_id == 4326:
        project = None
    else:
        transformer = Transformer.from_crs(f"EPSG:{srs_id}", "EPSG:4326", always_xy=True)

        def project(x, y):
            lons, lats = transformer.transform(x, y)
            # The Pacific-centred system can return longitudes past 180
            return [((lon + 180) % 360) - 180 for lon in lons], lats

    features = []
    for row in rows:
        properties = dict(zip(columns, row))
        blob = properties.pop(geometry_column)
        flags = blob[3]
        if flags & 0x10:  # empty geometry
            continue
        geometry = force_2d(from_wkb(blob[8 + _ENVELOPE_BYTES[(flags >> 1) & 7] :]))
        if project is not None:
            geometry = transform(project, geometry)
        features.append({"type": "Feature", "properties": properties, "geometry": mapping(geometry)})
    return {
        "type": "FeatureCollection",
        "name": table,
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }


def track_url_of(run: dict) -> str | None:
    """The cyclone track a run was given, from its parameters."""
    for parameter in (run.get("parameters") or {}).values():
        value = parameter.get("value") if isinstance(parameter, dict) else None
        if isinstance(value, str) and "/cyclone_track/" in value:
            return value
    return None


def advisory_name(cyclone_name: str, base_time) -> tuple[str, str]:
    """('2026101818_Wati', 'Wati') for an advisory.

    The backend groups advisories into one Event by the storm name after a leading date, so
    SPC's own names ('WATI_180600utc') are not usable as they are. The date comes from the
    advisory's base time, not from the time the track was posted.
    """
    storm = storm_name(cyclone_name)
    if storm == (cyclone_name or "").strip():  # no date prefix to strip
        match = re.match(r"[A-Za-z]+", storm)
        storm = match.group(0) if match else storm
    storm = storm.strip().title()
    return f"{base_time:%Y%m%d%H}_{storm}", storm


def base_time_of(track: dict, csv_text: str):
    """When an advisory's forecast starts: its first track point, else the CSV header, else issue time."""
    from django.utils.dateparse import parse_datetime

    for feature in (track.get("geometry") or {}).get("features") or []:
        value = (feature.get("properties") or {}).get("Time")
        parsed = parse_datetime(str(value)) if value else None
        if parsed is not None:
            return parsed
        break
    match = re.search(r"baseTime=([0-9T:\-]+Z)", csv_text[:2000])
    if match:
        return parse_datetime(match.group(1))
    return parse_datetime(track["issued_time"]) if track.get("issued_time") else None
