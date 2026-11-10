import datetime
import io
import json
import sqlite3
import tempfile
from pathlib import Path
from unittest import mock

from django.core.management import CommandError, call_command
from django.test import SimpleTestCase
from pyproj import Transformer
from shapely.geometry import LineString, Polygon, mapping
from shapely import to_wkb

from country.models import Country
from cyclone_track.models import CycloneTrack
from event.models import Event
from event_type.models import EventType
from risk_information.models import RiskInformation

from . import riskscape_ingest as rs
from .models import ModelRun
from .tests import QueueTestCase, write_ref_outputs

TOKEN = "sPcErfFDAlOkpOJBHNf7RQ=="
LINK = f"https://riskscape.nz/shared/results/{TOKEN}"
TO_MERCATOR = Transformer.from_crs("EPSG:4326", "EPSG:3832", always_xy=True)

TRACK_CSV = (
    "CREAT_TIME,MOD_TIME,TRACK_OID,Time,Latitude,Longitude,Symbol\n"
    "2026-10-18 22:29:31,2026-10-18 22:29:31,244851,2026-10-18T18:00:00Z,-19.1,-160.2,4\n"
    "2026-10-18 22:29:31,2026-10-18 22:29:31,244851,2026-10-19T00:00:00Z,-19.98,-159.1,4\n"
)


def write_geopackage(path, table, geometry):
    """A one-feature GeoPackage whose geometry is given in lon/lat, stored in EPSG:3832 like RiskScape's."""
    projected = type(geometry)(
        [TO_MERCATOR.transform(x, y) for x, y in (geometry.exterior.coords if hasattr(geometry, "exterior") else geometry.coords)]
    )
    header = b"GP\x00\x01" + (3832).to_bytes(4, "little", signed=True)  # little-endian, no envelope
    db = sqlite3.connect(path)
    db.executescript(
        f"""
        CREATE TABLE gpkg_spatial_ref_sys (srs_id INTEGER PRIMARY KEY);
        CREATE TABLE gpkg_geometry_columns (table_name TEXT, column_name TEXT, srs_id INTEGER);
        CREATE TABLE "{table}" (geom BLOB, Label TEXT);
        INSERT INTO gpkg_spatial_ref_sys VALUES (3832);
        INSERT INTO gpkg_geometry_columns VALUES ('{table}', 'geom', 3832);
        """
    )
    db.execute(f'INSERT INTO "{table}" VALUES (?, ?)', (header + to_wkb(projected), "x"))
    db.commit()
    db.close()


class ShareTokenTests(SimpleTestCase):
    def test_reads_the_token_from_a_link_or_takes_a_bare_token(self):
        self.assertEqual(rs.share_token(LINK), TOKEN)
        self.assertEqual(rs.share_token("https://riskscape.nz/shared/results/sPcErfFDAlOkpOJBHNf7RQ%3D%3D"), TOKEN)
        self.assertEqual(rs.share_token(f"  {TOKEN} "), TOKEN)

    def test_refuses_a_link_that_is_not_a_share_link(self):
        with self.assertRaises(rs.RiskScapeError):
            rs.share_token("https://riskscape.nz/projects/niwa")


class AdvisoryNameTests(SimpleTestCase):
    def at(self, hour):
        return datetime.datetime(2026, 10, 18, hour, tzinfo=datetime.timezone.utc)

    def test_names_every_style_of_spc_track_name_the_same_way(self):
        for cyclone_name, hour in (("WATI_180600utc", 6), ("WATI_181200utcWork", 12), ("2026101818_Wati", 18)):
            name, storm = rs.advisory_name(cyclone_name, self.at(hour))
            self.assertEqual((name, storm), (f"20261018{hour:02d}_Wati", "Wati"))

    def test_base_time_is_the_first_track_point_not_the_upload_time(self):
        track = {
            "issued_time": "2026-10-18T21:02:11Z",
            "geometry": {"features": [{"properties": {"Time": "2026-10-18T06:00:00Z"}}]},
        }
        self.assertEqual(rs.base_time_of(track, ""), datetime.datetime(2026, 10, 18, 6, tzinfo=datetime.timezone.utc))

    def test_base_time_falls_back_to_the_csv_header_then_the_issue_time(self):
        header = "# trackType=Official Forecast Track,baseTime=2026-10-18T12:00:00Z,,\n"
        self.assertEqual(
            rs.base_time_of({"issued_time": "2026-10-18T20:58:04Z"}, header),
            datetime.datetime(2026, 10, 18, 12, tzinfo=datetime.timezone.utc),
        )
        self.assertEqual(
            rs.base_time_of({"issued_time": "2026-10-18T20:58:04Z"}, ""),
            datetime.datetime(2026, 10, 18, 20, 58, 4, tzinfo=datetime.timezone.utc),
        )


class ConvertGeoPackageTests(SimpleTestCase):
    def test_gives_lon_lat_from_the_pacific_projection(self):
        with tempfile.TemporaryDirectory() as folder:
            path = f"{folder}/wind-swaths.gpkg"
            write_geopackage(path, "wind-swaths", Polygon([(-160, -20), (-159, -20), (-159, -19), (-160, -19)]))
            data = rs.convert_geopackage(path)

        self.assertEqual(data["name"], "wind-swaths")
        (feature,) = data["features"]
        self.assertEqual(feature["properties"], {"Label": "x"})
        for (lon, lat), (want_lon, want_lat) in zip(
            feature["geometry"]["coordinates"][0], [(-160, -20), (-159, -20), (-159, -19), (-160, -19), (-160, -20)]
        ):
            self.assertAlmostEqual(lon, want_lon, places=4)
            self.assertAlmostEqual(lat, want_lat, places=4)

    def test_converts_a_track_line(self):
        with tempfile.TemporaryDirectory() as folder:
            path = f"{folder}/cyclone-track.gpkg"
            write_geopackage(path, "cyclone-track", LineString([(-160.2, -19.1), (-159.1, -19.98)]))
            (feature,) = rs.convert_geopackage(path)["features"]
        self.assertEqual(feature["geometry"]["type"], "LineString")
        self.assertAlmostEqual(feature["geometry"]["coordinates"][0][0], -160.2, places=4)


class FakeResponse:
    def __init__(self, payload=None, content=b"", status_code=200):
        self.payload, self.content, self.status_code = payload, content, status_code

    def json(self):
        return self.payload


class FakeGuest:
    """Stands in for RiskScape: a run, and the bytes of each of its outputs."""

    runs = {}

    def __init__(self, base_url, token, session=None):
        self.token = token

    def open(self):
        return self.runs[self.token]["run"]

    def download(self, output, destination):
        Path(destination).write_bytes(self.runs[self.token]["files"][output["name"]])


def make_run(run_id, state="COMPLETE", skip=(), track_id=197):
    """A finished REF run, and the bytes RiskScape would serve for its outputs."""
    with tempfile.TemporaryDirectory() as folder:
        write_ref_outputs(folder, prefix="")
        files = {
            name.rsplit(".", 1)[0]: Path(f"{folder}/{name}").read_bytes()
            for name in (
                "regional-impacts.geojson",
                "regional-summary.csv",
                "total-exposed-by-country.csv",
                "total-by-windspeed.csv",
                "total-by-track-distance.csv",
                "exposure-by-cluster.geojson",
            )
        }
        for name, geometry in (
            ("cyclone-track", LineString([(-160.2, -19.1), (-159.1, -19.98)])),
            ("wind-swaths", Polygon([(-161, -20), (-159, -20), (-159, -18), (-161, -18)])),
            ("track-distance", Polygon([(-161, -21), (-158, -21), (-158, -18), (-161, -18)])),
        ):
            write_geopackage(f"{folder}/{name}.gpkg", name, geometry)
            files[name] = Path(f"{folder}/{name}.gpkg").read_bytes()
        files["floodplain-exposure"] = json.dumps({"type": "FeatureCollection", "features": []}).encode()
    media = {"geojson": "application/geo+json", "csv": "text/csv", "gpkg": "application/geopackage+sqlite3"}
    kinds = {"cyclone-track": "gpkg", "wind-swaths": "gpkg", "track-distance": "gpkg"}
    kinds.update({n: "csv" for n in files if n.startswith(("regional-summary", "total-"))})
    outputs = [
        {
            "name": name,
            "state": "COMPLETE",
            "mediaType": media[kinds.get(name, "geojson")],
            "uri": f"/api/model-runs/by-id/{run_id}/output/{name}",
        }
        for name in files
        if name not in skip
    ]
    run = {
        "id": run_id,
        "name": "x",
        "state": state,
        "finished": state == "COMPLETE",
        "outputs": outputs,
        "parameters": {
            "hazard": {"value": f"https://pacific-disaster-api.spc.int/partner_api/v1/cyclone_track/{track_id}/?format=json"}
        },
    }
    return {"run": run, "files": files}


def fake_http(cyclone_name, base_time):
    def get(url, **kwargs):
        if "format=json" in url:
            return FakeResponse(
                {
                    "cyclone_name": cyclone_name,
                    "issued_time": "2026-10-18T21:02:11Z",
                    "issued_agency": "RSMC",
                    "track_file": "https://pacific-disaster-api.spc.int/media/cyclone_tracks/track.csv",
                    "geometry": {"features": [{"properties": {"Time": base_time}}]},
                }
            )
        return FakeResponse(content=TRACK_CSV.encode())

    return get


class IngestRiskScapeRunTests(QueueTestCase):
    def setUp(self):
        super().setUp()
        EventType.objects.create(event_name="Tropical Cyclone")
        self.ck = Country.objects.get(code="CK")  # seeded by the country migrations

    def ingest(self, token=TOKEN, run=None, cyclone_name="2026101818_Wati", base_time="2026-10-18T18:00:00Z", **options):
        FakeGuest.runs = {token: run or make_run(20515)}
        out = io.StringIO()
        with mock.patch.object(rs, "RiskScapeGuest", FakeGuest), mock.patch.object(
            rs, "http_get", fake_http(cyclone_name, base_time)
        ):
            call_command("ingest_riskscape_run", f"https://riskscape.nz/shared/results/{token}", country="CK", stdout=out, **options)
        return out.getvalue()

    def test_loads_the_run_as_an_advisory_with_nine_outputs(self):
        output = self.ingest()

        track = CycloneTrack.objects.get(cyclone_name="2026101818_Wati")
        self.assertEqual(track.country, self.ck)
        self.assertEqual(track.issued_time, datetime.datetime(2026, 10, 18, 18, tzinfo=datetime.timezone.utc))
        self.assertTrue(track.geometry_computed)
        self.assertEqual(len(track.geometry["features"]), 2)
        self.assertFalse(track.notify)

        run = ModelRun.objects.get(tc_track=track)
        self.assertEqual(run.status, ModelRun.COMPLETE)
        # six tables, three overlays; the empty floodplain output is left out
        self.assertEqual(run.risk_information.count(), 9)
        swaths = run.risk_information.get(dataset_type="forecast_wind_swaths")
        self.assertTrue(swaths.geometry_computed)
        lon, lat = swaths.geometry["features"][0]["geometry"]["coordinates"][0][0]
        self.assertAlmostEqual(lon, -161, places=3)  # lon/lat, not metres
        event = Event.objects.get(country=self.ck)
        self.assertEqual(event.title, "Tropical Cyclone Wati")
        self.assertEqual(event.model_run, run)
        self.assertIn("TC Wati - advisory 2026-10-18 18:00Z", output)

    def test_does_not_store_the_share_link(self):
        self.ingest()
        self.assertEqual(ModelRun.objects.get().external_url, "")
        self.assertFalse(RiskInformation.objects.filter(title__contains=TOKEN).exists())

    def test_the_external_url_is_only_what_the_caller_gives(self):
        self.ingest(external_url="https://riskscape.nz/api/model-runs/by-id/20515")
        self.assertEqual(ModelRun.objects.get().external_url, "https://riskscape.nz/api/model-runs/by-id/20515")

    def test_running_it_twice_imports_once(self):
        self.ingest()
        output = self.ingest()

        self.assertIn("Already imported", output)
        self.assertEqual(ModelRun.objects.count(), 1)
        self.assertEqual(CycloneTrack.objects.count(), 1)

    def test_replace_imports_again_without_duplicating(self):
        self.ingest()
        self.ingest(replace=True)

        self.assertEqual(ModelRun.objects.count(), 1)
        self.assertEqual(ModelRun.objects.get().risk_information.count(), 9)

    def test_dry_run_writes_nothing(self):
        output = self.ingest(dry_run=True)

        self.assertIn("Dry run", output)
        self.assertEqual(CycloneTrack.objects.count(), 0)
        self.assertEqual(ModelRun.objects.count(), 0)
        self.assertEqual(Event.objects.count(), 0)

    def test_advisories_of_one_storm_share_an_event_and_the_newest_is_shown(self):
        self.ingest(
            token="aaa", run=make_run(20508, track_id=154), cyclone_name="WATI_180600utc", base_time="2026-10-18T06:00:00Z"
        )
        self.ingest(
            token="bbb", run=make_run(20507, track_id=153), cyclone_name="WATI_181200utcWork", base_time="2026-10-18T12:00:00Z"
        )

        self.assertEqual(
            sorted(CycloneTrack.objects.values_list("cyclone_name", flat=True)), ["2026101806_Wati", "2026101812_Wati"]
        )
        event = Event.objects.get()  # one Event, not one per advisory
        self.assertEqual(event.cyclone_track.cyclone_name, "2026101812_Wati")
        self.assertEqual(ModelRun.objects.count(), 2)

    def test_refuses_a_run_that_has_not_finished(self):
        with self.assertRaisesMessage(CommandError, "not COMPLETE"):
            self.ingest(run=make_run(20515, state="RUNNING"))
        self.assertEqual(CycloneTrack.objects.count(), 0)

    def test_refuses_a_run_missing_a_required_output(self):
        with self.assertRaisesMessage(CommandError, "regional-summary"):
            self.ingest(run=make_run(20515, skip=("regional-summary",)))
        self.assertEqual(ModelRun.objects.count(), 0)

    def test_a_rejected_link_is_a_command_error(self):
        class Refusing(FakeGuest):
            def open(self):
                raise rs.RiskScapeError("RiskScape refused the link (HTTP 401).")

        with mock.patch.object(rs, "RiskScapeGuest", Refusing):
            with self.assertRaisesMessage(CommandError, "refused the link"):
                call_command("ingest_riskscape_run", LINK, country="CK", stdout=io.StringIO())

    def test_unknown_country_is_refused(self):
        with self.assertRaisesMessage(CommandError, "No country matching"):
            call_command("ingest_riskscape_run", LINK, country="XX", stdout=io.StringIO())
