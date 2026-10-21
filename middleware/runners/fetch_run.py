#!/usr/bin/env python3
"""Download a finished RiskScape run's outputs into a folder `import_ref_run` can load.

    RISKSCAPE_TOKEN=... python runners/fetch_run.py <run> <folder> [--url https://riskscape.nz]

<run> is the run's number (the id in RiskScape's /api/model-runs/by-id/<id>), or its API path or
URL. A shared-results link (/shared/results/...) is only a web page and cannot be fetched this way;
use the run's number instead. The token's account must be allowed to see the run (guest links need
no account, but the API does).

The files are saved as the platform names them ("<run name>-regional-summary.csv"); import_ref_run
matches by the end of the name, so the prefix is harmless.
"""

import argparse
import os
import shutil
import sys
from pathlib import Path
from urllib.parse import urlparse

import requests

MEDIA_SUFFIXES = {
    "text/csv": ".csv",
    "application/geopackage+sqlite3": ".gpkg",
    "application/geo+json": ".geojson",
}


class FetchFailed(Exception):
    pass


def api_path(run: str, base_url: str) -> str:
    """The API path for a run given as a full URL, an /api path or a web-page path."""
    if run.strip().isdigit():
        return f"/api/model-runs/by-id/{run.strip()}"
    path = urlparse(run).path if run.startswith("http") else run
    if not path.startswith("/"):
        raise FetchFailed(f"Expected a run number, a URL or a path starting with /, got {run!r}.")
    if path.startswith("/shared/"):
        raise FetchFailed(
            "A shared-results link is a web page, not an API address. Use the run's number (the id in "
            "/api/model-runs/by-id/<id>), which the run's owner can read from the run page."
        )
    return path if path.startswith("/api/") else f"/api{path}"


def fetch(run: str, folder: Path, base_url: str, token: str, session=None) -> list[Path]:
    base_url = base_url.rstrip("/")
    session = session or requests.Session()
    session.auth = ("TOKEN", token)
    session.headers["Accept"] = "application/json"

    def get(url, **kwargs):
        response = session.get(url, timeout=kwargs.pop("timeout", 120), **kwargs)
        if not response.ok:
            raise FetchFailed(f"GET {url}: HTTP {response.status_code}: {response.text[:300]}")
        return response

    meta = get(f"{base_url}{api_path(run, base_url)}").json()
    if meta.get("state") not in (None, "COMPLETE"):
        raise FetchFailed(f"The run is {meta.get('state')}, not COMPLETE.")
    outputs = meta.get("outputs")
    if not outputs:
        raise FetchFailed(f"The run has no outputs (fields seen: {', '.join(sorted(meta))}).")

    folder.mkdir(parents=True, exist_ok=True)
    saved = []
    for output in outputs:
        suffix = MEDIA_SUFFIXES.get(output.get("mediaType"), ".bin")
        dest = folder / f"{output['name']}{suffix}"
        response = get(f"{base_url}{output['uri']}/download", stream=True, timeout=600)
        with dest.open("wb") as f:
            shutil.copyfileobj(response.raw, f)
        saved.append(dest)
    return saved


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run", help="the run's address (URL or path)")
    parser.add_argument("folder", type=Path, help="where to save the outputs")
    parser.add_argument("--url", default=os.environ.get("RISKSCAPE_URL", "https://riskscape.nz"))
    args = parser.parse_args()
    token = os.environ.get("RISKSCAPE_TOKEN")
    if not token:
        sys.exit("RISKSCAPE_TOKEN is not set")
    try:
        saved = fetch(args.run, args.folder, args.url, token)
    except FetchFailed as e:
        sys.exit(str(e))
    for path in saved:
        print(f"{path.stat().st_size:>10}  {path.name}")


if __name__ == "__main__":
    main()
