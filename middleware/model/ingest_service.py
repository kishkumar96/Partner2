"""Load a finished Rapid Exposure Forecast run into the database.

Shared by `ingest_riskscape_run` (which fetches the run from a RiskScape share link) and the
`model_run/import/` endpoint (which is sent the outputs). Both end up with a folder of outputs, the
SPC track the run was given, and a country; what follows is the same.
"""

import dataclasses
import datetime
import json
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse

from django.core.files.base import ContentFile
from django.core.management.base import CommandError
from django.utils import timezone

from cyclone_track.models import CycloneTrack
from cyclone_track_type.models import CycloneTrackType

from . import riskscape_ingest as rs
from .management.commands.import_ref_run import Command as ImportRefRun
from .management.commands.import_ref_run import track_points
from .models import ModelRun

# A run is nine small files; these cap what a caller can make the server write
MAX_ARCHIVE_FILES = 40
MAX_ARCHIVE_BYTES = 300 * 1024 * 1024
MAX_TRACK_BYTES = 5 * 1024 * 1024
ARCHIVE_SUFFIXES = {".geojson", ".csv", ".gpkg"}


class IngestError(Exception):
    """The run can't be loaded; the message is safe to show to whoever supplied it."""


@dataclasses.dataclass(frozen=True)
class Advisory:
    name: str  # <YYYYMMDDHH>_<Storm>, which is what groups advisories into one Event
    storm: str
    base_time: datetime.datetime
    title: str


def fetch_track(url: str, allowed_hosts=None):
    """The SPC track named by `url` (its JSON) and its track file, as (data, csv bytes).

    With `allowed_hosts` the address must be https on one of those hosts, even after redirects:
    the endpoint fetches whatever address a caller names, so it must not be pointed at anything
    else on the network.
    """
    if allowed_hosts is not None:
        allowed = {host.lower() for host in allowed_hosts}
        parsed = urlparse(url)
        if parsed.scheme != "https" or (parsed.hostname or "").lower() not in allowed:
            raise IngestError("The track must be an https address on a host this server accepts.")

    def get(address):
        response = rs.http_get(address)
        if allowed_hosts is not None:
            final = urlparse(getattr(response, "url", None) or address)
            if final.scheme != "https" or (final.hostname or "").lower() not in allowed:
                raise IngestError("The track address redirected somewhere this server does not accept.")
        if response.status_code != 200:
            raise IngestError(f"Couldn't read {address} (HTTP {response.status_code}).")
        return response

    json_url = url if "format=json" in url else url.rstrip("/") + "/?format=json"
    data = get(json_url).json()
    file_url = data.get("track_file")
    if not file_url:
        raise IngestError(f"The track {url} has no track file.")
    if allowed_hosts is not None:
        file_url = file_url.replace("http://", "https://", 1)
        if (urlparse(file_url).hostname or "").lower() not in allowed:
            raise IngestError("The track file is on a host this server does not accept.")
    content = get(file_url).content
    if len(content) > MAX_TRACK_BYTES:
        raise IngestError("The track file is too large.")
    data["_file_name"] = file_url.rsplit("/", 1)[-1]
    return data, content


def resolve_advisory(track_data: dict, csv_bytes: bytes, storm: str | None = None) -> Advisory:
    base_time = rs.base_time_of(track_data, csv_bytes.decode("utf-8", errors="replace"))
    if base_time is None:
        raise IngestError("Can't tell when the advisory starts; the track has no times.")
    if timezone.is_naive(base_time):
        base_time = timezone.make_aware(base_time, datetime.timezone.utc)
    name, storm_name = rs.advisory_name(storm or track_data.get("cyclone_name") or "", base_time)
    return Advisory(
        name=name,
        storm=storm_name,
        base_time=base_time,
        title=f"TC {storm_name} - advisory {base_time:%Y-%m-%d %H:%M}Z",
    )


def find_track(advisory: Advisory, country) -> CycloneTrack | None:
    return CycloneTrack.objects.filter(cyclone_name=advisory.name, country=country).first()


def imported_run(track: CycloneTrack | None) -> ModelRun | None:
    """The run already imported for this advisory's track, if any."""
    if track is None:
        return None
    return ModelRun.objects.filter(tc_track=track, models__name=ImportRefRun.IMPORT_MODEL_NAME).first()


def create_track(advisory: Advisory, country, track_data: dict, csv_bytes: bytes, folder: Path) -> CycloneTrack:
    track = CycloneTrack(
        cyclone_name=advisory.name,
        issued_time=advisory.base_time,
        issued_agency=track_data.get("issued_agency") or "RSMC",
        country=country,
        cyclone_track_type=CycloneTrackType.objects.filter(name__icontains="forecast").first(),
        notify=False,  # a track made here must not send mail or queue runs
    )
    track.track_file.save(track_data["_file_name"], ContentFile(csv_bytes), save=True)
    track.refresh_from_db()
    if not track.geometry_computed:
        # The CSV didn't give a line; the run's own track output still does
        overlay = folder / "cyclone-track.geojson"
        if not overlay.exists():
            raise IngestError(f"Track {track.pk} has no readable points and the run has no track output.")
        CycloneTrack.objects.filter(pk=track.pk).update(geometry=track_points(overlay), geometry_computed=True)
        track.refresh_from_db()
    return track


def import_folder(folder: Path, country, track: CycloneTrack, advisory: Advisory, *, replace=False, external_url=""):
    """Import a folder of outputs as an advisory run of the track's storm. Returns (event, run, skipped)."""
    importer = ImportRefRun()
    try:
        outputs, skipped = importer.collect_outputs(folder)
        event, run = importer.import_as_run(
            {"track": track.pk, "replace": replace, "external_url": external_url}, country, outputs, advisory.title
        )
    except CommandError as error:
        raise IngestError(str(error)) from error
    return event, run, skipped


def unpack_outputs(archive, destination: Path) -> list[str]:
    """Unzip a run's outputs flat into `destination`, GeoPackages converted to lon/lat GeoJSON.

    Only .geojson, .csv and .gpkg files are kept and their folder names dropped, so nothing in the
    archive can land outside `destination`; the size is counted as it is written, not trusted.
    """
    try:
        zipped = zipfile.ZipFile(archive)
    except zipfile.BadZipFile as error:
        raise IngestError("The outputs are not a zip file.") from error
    with zipped:
        members = [info for info in zipped.infolist() if not info.is_dir()]
        if len(members) > MAX_ARCHIVE_FILES:
            raise IngestError(f"The zip has more than {MAX_ARCHIVE_FILES} files.")
        written = 0
        names = []
        for info in members:
            path = PurePosixPath(info.filename.replace("\\", "/"))
            if path.is_absolute() or ".." in path.parts:
                raise IngestError(f"Unsafe path in the zip: {info.filename}")
            if path.suffix.lower() not in ARCHIVE_SUFFIXES or path.name.startswith("."):
                continue
            target = destination / path.name
            if target.exists():
                raise IngestError(f"The zip has two files named {path.name}.")
            with zipped.open(info) as source, target.open("wb") as sink:
                while chunk := source.read(1 << 16):
                    written += len(chunk)
                    if written > MAX_ARCHIVE_BYTES:
                        raise IngestError("The zip is too large once unpacked.")
                    sink.write(chunk)
            names.append(path.name)

    for name in list(names):
        path = destination / name
        if path.suffix.lower() != ".gpkg":
            continue
        geojson = path.with_suffix(".geojson")
        if not geojson.exists():  # a GeoJSON the caller already sent wins
            try:
                geojson.write_text(json.dumps(rs.convert_geopackage(path)), encoding="utf-8")
            except Exception as error:  # a damaged GeoPackage is the caller's file, not a server fault
                raise IngestError(f"{name} can't be read as a GeoPackage.") from error
        path.unlink()  # the importer reads GeoJSON, and a .gpkg beside it would only confuse it
    return sorted(p.name for p in destination.iterdir())
