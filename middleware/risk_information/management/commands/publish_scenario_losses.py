"""Publish the scenario loss tables as static files, for a partner API that has no risk_scenario.

The dashboard reads loss by sea-level rise and return period (``RiskScenario``) and its split by
sector and asset type (``RiskScenarioBreakdown``) from this API. A deployment without those
endpoints can still serve them: this command writes the same rows, in the serializers' field
names, as compressed JSON under one folder, and the dashboard fetches them straight from the
bucket (the address comes from the zarr pointer row in ``hazard_information``):

    <destination>/manifest.json                        counts and loss totals, written last
    <destination>/<CC>/scenarios.json                  every RiskScenario row of the country
    <destination>/<CC>/breakdown/<risk_information>.json
                                                       {"<risk_scenario id>": [breakdown rows]}

The folder name carries a version ("v1"): change the file layout under a new one so pages already
open keep working. Nothing is published unless it reads back byte for byte; the manifest goes up
last, so a half-finished upload is never mistaken for a complete one.
"""

import gzip
import hashlib
import json
from collections import defaultdict
from datetime import datetime, timezone

import fsspec
from django.core.management.base import BaseCommand, CommandError

from hazard_tiles import store
from risk_information.models import RiskScenario, RiskScenarioBreakdown
from risk_information.serializers import RiskScenarioBreakdownSerializer, RiskScenarioSerializer

LAYOUT_VERSION = 1
# Short: the numbers change when a run is imported, and a stale copy should age out quickly.
CACHE_CONTROL = "public, max-age=300"


def country_key(country) -> str:
    return (getattr(country, "code", None) or country.short_name or "").strip().upper()


def encode(payload) -> bytes:
    """Compact JSON. ``mtime=0`` keeps the bytes identical between runs of the same data."""
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return gzip.compress(raw, compresslevel=9, mtime=0)


BREAKDOWN_FIELDS = RiskScenarioBreakdownSerializer.Meta.fields


def breakdown_rows(scenario_ids):
    """The breakdown rows of some scenarios as plain dicts in the serializer's field names.

    Straight from the database, a chunk at a time: a country has hundreds of thousands of them,
    and building a serializer object for each one does not fit in a small server's memory.
    """
    columns = [("risk_scenario_id" if name == "risk_scenario" else name) for name in BREAKDOWN_FIELDS]
    queryset = RiskScenarioBreakdown.objects.filter(risk_scenario_id__in=scenario_ids).order_by("id")
    for values in queryset.values(*columns).iterator(chunk_size=5000):
        row = {name: values[column] for name, column in zip(BREAKDOWN_FIELDS, columns)}
        yield row


def iter_files(manifest: dict):
    """Yield ``(relative path, bytes)`` for every file, one at a time, and fill in ``manifest``.

    A product's breakdown is built, yielded and dropped before the next one is read, so the memory
    used is that of the largest product, not of the whole table.
    """
    scenarios = list(RiskScenario.objects.select_related("risk_information__country").order_by("id"))
    by_country: dict[str, list[RiskScenario]] = defaultdict(list)
    for scenario in scenarios:
        key = country_key(scenario.risk_information.country)
        if not key:
            raise CommandError(f"Scenario {scenario.pk} belongs to a country with no code or short name.")
        by_country[key].append(scenario)

    for key, rows in sorted(by_country.items()):
        products: dict[str, dict] = {}
        manifest["countries"][key] = {
            "scenarios": len(rows),
            "total_loss": round(sum(r.total_loss or 0 for r in rows), 2),
            "products": products,
        }
        yield f"{key}/scenarios.json", encode(list(RiskScenarioSerializer(rows, many=True).data))
        for risk_information_id in sorted({row.risk_information_id for row in rows}):
            scenario_ids = [row.pk for row in rows if row.risk_information_id == risk_information_id]
            grouped: dict[str, list] = defaultdict(list)
            loss = 0.0
            for row in breakdown_rows(scenario_ids):
                grouped[str(row["risk_scenario"])].append(row)
                loss += row["total_loss"] or 0
            products[str(risk_information_id)] = {
                "title": next(r.risk_information.title for r in rows if r.risk_information_id == risk_information_id),
                "scenarios": len(scenario_ids),
                "breakdown_rows": sum(len(v) for v in grouped.values()),
                "breakdown_loss": round(loss, 2),
            }
            if grouped:
                yield f"{key}/breakdown/{risk_information_id}.json", encode(dict(grouped))
            del grouped


def remote_files(fs, root: str) -> dict[str, int]:
    if not fs.exists(root):
        return {}
    prefix = root.rstrip("/") + "/"
    return {
        path[len(prefix):]: info["size"]
        for path, info in fs.find(root, detail=True).items()
        if info.get("type", "file") == "file"
    }


class Command(BaseCommand):
    help = "Publish the scenario loss tables (RiskScenario and its breakdown) as compressed JSON files."

    def add_arguments(self, parser):
        parser.add_argument("destination", help="a folder, or s3://bucket/scenario_losses/v1")
        parser.add_argument("--dry-run", action="store_true", help="build and check the files, upload nothing")
        parser.add_argument("--replace", action="store_true", help="publish over files already at the destination")

    def handle(self, *args, **options):
        destination = options["destination"].rstrip("/")
        remote = "://" in destination
        dry_run = options["dry_run"]
        fs, root = fsspec.core.url_to_fs(destination, **(store.s3_options() if remote else {}))
        existing = remote_files(fs, root)
        if existing and not options["replace"] and not dry_run:
            raise CommandError(f"{destination} already has {len(existing)} files; pass --replace to publish over them.")

        manifest: dict = {"version": LAYOUT_VERSION, "countries": {}, "files": {}}
        extra = {"ContentType": "application/json", "ContentEncoding": "gzip", "CacheControl": CACHE_CONTROL} if remote else {}
        for relative, data in iter_files(manifest):
            manifest["files"][relative] = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
            if not dry_run:
                target = f"{root}/{relative}"
                fs.makedirs(target.rsplit("/", 1)[0], exist_ok=True)
                fs.pipe_file(target, data, **extra)
        if not manifest["files"]:
            raise CommandError("There are no scenarios to publish.")

        total = sum(info["bytes"] for info in manifest["files"].values())
        self.stdout.write(f"{len(manifest['files'])} files, {total / 1e6:.2f} MB compressed:")
        for key, info in manifest["countries"].items():
            rows = sum(p["breakdown_rows"] for p in info["products"].values())
            self.stdout.write(f"  {key}: {info['scenarios']} scenarios, {len(info['products'])} products, {rows} breakdown rows")
        if dry_run:
            self.stdout.write("Dry run: nothing uploaded.")
            return

        manifest["generated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        manifest_bytes = json.dumps(manifest, indent=1, sort_keys=True).encode("utf-8")
        # the manifest last, and uncompressed so it can be read without any special handling
        fs.pipe_file(
            f"{root}/manifest.json",
            manifest_bytes,
            **({"ContentType": "application/json", "CacheControl": CACHE_CONTROL} if remote else {}),
        )
        mismatched = [
            name
            for name, info in manifest["files"].items()
            if hashlib.sha256(fs.cat_file(f"{root}/{name}")).hexdigest() != info["sha256"]
        ]
        if mismatched or fs.cat_file(f"{root}/manifest.json") != manifest_bytes:
            raise CommandError(f"Read-back check failed for {mismatched[:5] or ['manifest.json']}")
        self.stdout.write(self.style.SUCCESS(f"Published {len(manifest['files']) + 1} files to {destination}; every file reads back identical."))
