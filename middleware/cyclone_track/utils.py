import csv
import io
from typing import Any


def _clean_cell(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _norm_header(value: str) -> str:
    return " ".join(_clean_cell(value).split()).lower()


def _unique_headers(headers: list[str]) -> list[str]:
    """Ensure headers are unique JSON keys."""
    seen: dict[str, int] = {}
    out: list[str] = []
    for h in headers:
        base = _clean_cell(h) or "col"
        count = seen.get(base, 0)
        if count == 0:
            out.append(base)
        else:
            out.append(f"{base}_{count}")
        seen[base] = count + 1
    return out


def _parse_cell(value: Any) -> Any:
    value = _clean_cell(value)
    if value == "" or value.lower() == "nan":
        return None
    # Try int, then float, else keep string
    try:
        if value.isdigit() or (value.startswith("-") and value[1:].isdigit()):
            return int(value)
        return float(value)
    except ValueError:
        return value


def _to_float(value: Any) -> float | None:
    parsed = _parse_cell(value)
    if parsed is None:
        return None
    if isinstance(parsed, (int, float)):
        return float(parsed)
    try:
        return float(parsed)
    except (TypeError, ValueError):
        return None


def _normalize_longitude(lon: float) -> float:
    if lon > 180:
        return lon - 360
    if lon < -180:
        return lon + 360
    return lon


def cyclone_csv_to_geojson(file_obj) -> dict[str, Any] | None:
    """Parse the cyclone CSV and return a simple GeoJSON dict.

    Output is a FeatureCollection of Point features (one per row), where each
    feature has properties for all CSV columns.
    """

    meta: dict[str, str] = {}
    headers: list[str] | None = None
    expecting_headers = False
    lat_idx: int | None = None
    lon_idx: int | None = None
    features: list[dict[str, Any]] = []

    text_stream = io.TextIOWrapper(file_obj, encoding="utf-8", errors="replace")
    reader = csv.reader(text_stream)

    for row in reader:
        if not row:
            continue

        first_cell = _clean_cell(row[0])

        # Comment/meta lines start with '#'
        if first_cell.startswith("#"):
            # Example: "# CycloneName=Lola,...."
            token = first_cell.lstrip("#").strip()
            if _norm_header(token).startswith("column headings"):
                expecting_headers = True
                continue
            if "=" in token:
                key, value = token.split("=", 1)
                meta[key.strip()] = value.strip()
            continue

        # Header row (not starting with '#')
        if expecting_headers or first_cell.startswith("Time["):
            raw_headers = [(_clean_cell(h) or f"col_{idx}") for idx, h in enumerate(row)]
            # normalize first header so it's less awkward as a JSON key
            if raw_headers:
                raw_headers[0] = "Time"
            headers = _unique_headers(raw_headers)
            expecting_headers = False

            # Try to locate latitude/longitude column indexes by name.
            normed = [_norm_header(h) for h in headers]
            for idx, nh in enumerate(normed):
                if lat_idx is None and (nh == "latitude" or nh.endswith(" latitude") or "lat" == nh):
                    lat_idx = idx
                if lon_idx is None and (nh == "longitude" or nh.endswith(" longitude") or "lon" == nh):
                    lon_idx = idx

            # Fallback: if this is the common format, assume Time,Lat,Lon.
            if lat_idx is None and lon_idx is None and len(headers) >= 3:
                lat_idx, lon_idx = 1, 2

            continue

        # If we haven't found headers yet, try to detect them.
        if headers is None:
            lowered = [_norm_header(c) for c in row]
            if "latitude" in lowered and "longitude" in lowered:
                raw_headers = [(_clean_cell(h) or f"col_{idx}") for idx, h in enumerate(row)]
                if raw_headers:
                    raw_headers[0] = _clean_cell(raw_headers[0]) or "Time"
                headers = _unique_headers(raw_headers)
                lat_idx = lowered.index("latitude")
                lon_idx = lowered.index("longitude")
                continue

        # Data rows: Time, Latitude, Longitude, ...
        if headers is None:
            continue

        if len(row) < 3:
            continue

        if lat_idx is None or lon_idx is None:
            continue

        lat = _to_float(row[lat_idx] if lat_idx < len(row) else None)
        lon = _to_float(row[lon_idx] if lon_idx < len(row) else None)
        if lat is None or lon is None:
            continue

        props: dict[str, Any] = {}
        for idx, header in enumerate(headers):
            cell = row[idx] if idx < len(row) else None
            props[header] = _parse_cell(cell)

        features.append(
            {
                "type": "Feature",
                "properties": props,
                "geometry": {
                    "type": "Point",
                    "coordinates": [_normalize_longitude(lon), lat],
                },
            }
        )

    if not features:
        return None

    return {
        "type": "FeatureCollection",
        "metadata": meta,
        "features": features,
    }
