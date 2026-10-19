"""Fetch a finished RiskScape run from its share link and load it as an advisory of the storm's Event.

    python manage.py ingest_riskscape_run https://riskscape.nz/shared/results/<token> --country CK

This is the download-and-prepare half that `import_ref_run` leaves to a person. It:

  1. exchanges the link for a read-only session and reads the run (it must be complete);
  2. reads the cyclone track the run was given (from the run's parameters) and names the
     advisory <YYYYMMDDHH>_<Storm> from the track's base time, so advisories of one storm
     land on one Event;
  3. downloads the run's outputs, turning the GeoPackage overlays into lon/lat GeoJSON;
  4. creates the track (or reuses it) and loads the run as an advisory.

Running it again for the same run does nothing unless --replace is given. --dry-run reads the
run and prints what would happen without writing anything. The same loading is offered to
scripts by the `model_run/import/` endpoint, which is sent the outputs instead of a link.
"""

import json
import tempfile
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from country.lookup import find_country

from ... import ingest_service as svc
from ... import riskscape_ingest as rs
from ..commands.import_ref_run import OPTIONAL_OUTPUTS, REF_OUTPUTS


class Command(BaseCommand):
    help = "Download a finished RiskScape run from its share link and load it as an advisory."

    def add_arguments(self, parser):
        parser.add_argument("link", help="The run's share link (or just its token).")
        parser.add_argument("--country", required=True, help="Country code, e.g. CK (a name also works).")
        parser.add_argument("--riskscape-url", default=rs.DEFAULT_RISKSCAPE_URL)
        parser.add_argument("--track-url", help="The run's cyclone track, if its parameters don't name one.")
        parser.add_argument("--storm", help="Storm name, if the track's name can't be read.")
        parser.add_argument(
            "--external-url",
            default="",
            help=(
                "Where the run lives. Not the share link by default: it is a credential for the run, "
                "and this value is served by the public API."
            ),
        )
        parser.add_argument("--replace", action="store_true", help="Import again if this advisory was imported.")
        parser.add_argument("--dry-run", action="store_true", help="Read the run and report; write nothing.")

    def handle(self, *args, **options):
        country = find_country(options["country"])
        if country is None:
            raise CommandError(f"No country matching '{options['country']}'. Give its code, e.g. CK.")
        try:
            self.ingest(country, options)
        except (rs.RiskScapeError, svc.IngestError) as error:
            raise CommandError(str(error)) from error

    def ingest(self, country, options):
        guest = rs.RiskScapeGuest(options["riskscape_url"], rs.share_token(options["link"]))
        run = guest.open()
        self.stdout.write(f"RiskScape run {run.get('id')} '{run.get('name')}': {run.get('state')}")
        if run.get("state") != "COMPLETE" or not run.get("finished"):
            raise CommandError(f"The run is {run.get('state')}, not COMPLETE; try again when it has finished.")

        outputs = {o["name"]: o for o in run.get("outputs") or [] if o.get("state") == "COMPLETE"}
        wanted = {Path(name).stem for name in REF_OUTPUTS}
        missing = sorted(name for name in wanted if name not in outputs)
        if missing:
            raise CommandError(f"The run has no complete output for: {', '.join(missing)}")

        url = options["track_url"] or rs.track_url_of(run)
        if not url:
            raise CommandError("The run's parameters don't name a cyclone track; pass --track-url.")
        track_data, csv_bytes = svc.fetch_track(url)
        advisory = svc.resolve_advisory(track_data, csv_bytes, options["storm"])
        self.stdout.write(
            f"Advisory {advisory.name}, base time {advisory.base_time:%Y-%m-%d %H:%MZ}, title '{advisory.title}'"
        )

        track = svc.find_track(advisory, country)
        if svc.imported_run(track) and not options["replace"]:
            self.stdout.write(f"Already imported as track {track.pk}; nothing to do (--replace to import again).")
            return
        if options["dry_run"]:
            extra = [n for n in outputs if n in {Path(o).stem for o in OPTIONAL_OUTPUTS}]
            self.stdout.write(
                f"Dry run: would load {len(wanted)} outputs; the run also offers {', '.join(extra) or 'no'} overlays "
                f"as an advisory of country {country.short_name}; nothing written."
            )
            return

        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            self.download_outputs(guest, outputs, folder)
            if track is None:
                track = svc.create_track(advisory, country, track_data, csv_bytes, folder)
                self.stdout.write(f"Created track {track.pk} '{advisory.name}'.")
            event, model_run, skipped = svc.import_folder(
                folder, country, track, advisory, replace=options["replace"], external_url=options["external_url"]
            )
        if skipped:
            self.stdout.write(f"Skipped empty overlays: {', '.join(skipped)}.")
        shows = "now the run the Event shows" if event.model_run_id == model_run.pk else "kept alongside a newer run"
        self.stdout.write(
            self.style.SUCCESS(
                f"Run {model_run.pk} '{advisory.title}' for {country.short_name}: Event {event.pk} '{event.title}', "
                f"track {track.pk}, {model_run.risk_information.count()} outputs, {shows}."
            )
        )

    def download_outputs(self, guest, outputs, folder):
        wanted = {Path(name).stem for name in REF_OUTPUTS} | {Path(name).stem for name in OPTIONAL_OUTPUTS}
        for name, output in outputs.items():
            if name not in wanted:
                continue
            suffix = rs.MEDIA_SUFFIXES.get(output.get("mediaType"))
            if suffix is None:
                self.stdout.write(f"Skipping {name}: unknown format {output.get('mediaType')}.")
                continue
            if suffix == ".gpkg":
                gpkg = folder / f"{name}.gpkg"
                guest.download(output, gpkg)
                (folder / f"{name}.geojson").write_text(json.dumps(rs.convert_geopackage(gpkg)), encoding="utf-8")
                gpkg.unlink()  # the importer reads the GeoJSON, and a .gpkg would only confuse it
            else:
                guest.download(output, folder / f"{name}{suffix}")
