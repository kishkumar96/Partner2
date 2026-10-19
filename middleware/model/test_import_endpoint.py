import io
import zipfile
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from country.models import Country
from cyclone_track.models import CycloneTrack
from event.models import Event
from event_type.models import EventType
from risk_information.models import RiskInformation

from . import ingest_service as svc
from . import riskscape_ingest as rs
from .models import ModelRun
from .test_ingest_riskscape import fake_http, make_run
from .tests import QueueTestCase

URL = "/partner_api/v1/model_run/import/"
TRACK_URL = "https://pacific-disaster-api.spc.int/partner_api/v1/cyclone_track/197/?format=json"
OVERLAYS = {"cyclone-track", "wind-swaths", "track-distance"}


def extension(name):
    if name in OVERLAYS:
        return "gpkg"
    return "csv" if name.startswith(("regional-summary", "total-")) else "geojson"


def run_zip(run=None, prefix="outputs/Wati_run/", skip=(), extra=None):
    """The zip REF.sh would make: every output under a folder, plus whatever else is in extra."""
    files = (run or make_run(20515))["files"]
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, content in files.items():
            if name not in skip:
                archive.writestr(f"{prefix}{name}.{extension(name)}", content)
        for name, content in (extra or {}).items():
            archive.writestr(name, content)
    return buffer.getvalue()


class ImportEndpointTests(QueueTestCase):
    def setUp(self):
        super().setUp()
        EventType.objects.create(event_name="Tropical Cyclone")
        self.ck = Country.objects.get(code="CK")  # seeded by the country migrations
        self.user = get_user_model().objects.create_user("tc-runner", password="x")
        self.user.user_permissions.add(
            *Permission.objects.filter(
                codename__in=["add_modelrun", "add_riskinformation", "add_cyclonetrack"],
                content_type__app_label__in=["model", "risk_information", "cyclone_track"],
            )
        )
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def send(self, content=None, cyclone_name="2026101818_Wati", base_time="2026-10-18T18:00:00Z", client=None, **fields):
        body = {
            "country": "CK",
            "track_url": TRACK_URL,
            "outputs": SimpleUploadedFile("run.zip", content if content is not None else run_zip(), "application/zip"),
            **fields,
        }
        with mock.patch.object(rs, "http_get", side_effect=fake_http(cyclone_name, base_time)) as get:
            response = (client or self.api).post(URL, body, format="multipart")
        self.http_get = get
        return response

    def test_imports_the_run_as_an_advisory_of_the_storms_event(self):
        response = self.send(riskscape_run="https://riskscape.nz/api/model-runs/by-id/20515")

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.data["advisory"], "2026101818_Wati")
        self.assertEqual(response.data["outputs"], 9)  # six tables, three overlays; the empty floodplain is left out
        self.assertTrue(response.data["shown"])
        track = CycloneTrack.objects.get(cyclone_name="2026101818_Wati")
        self.assertEqual(track.country, self.ck)
        self.assertTrue(track.geometry_computed)
        self.assertFalse(track.notify)
        run = ModelRun.objects.get(pk=response.data["run"])
        self.assertEqual(run.external_url, "https://riskscape.nz/api/model-runs/by-id/20515")
        event = Event.objects.get(pk=response.data["event"])
        self.assertEqual((event.title, event.model_run), ("Tropical Cyclone Wati", run))

    def test_the_overlays_arrive_as_lon_lat_not_the_runs_projection(self):
        response = self.send()

        swaths = RiskInformation.objects.get(model_run=response.data["run"], dataset_type="forecast_wind_swaths")
        lon, lat = swaths.geometry["features"][0]["geometry"]["coordinates"][0][0]
        self.assertAlmostEqual(lon, -161, places=3)
        self.assertAlmostEqual(lat, -20, places=3)

    def test_sending_the_same_run_again_changes_nothing(self):
        self.send()
        response = self.send()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["already_imported"])
        self.assertEqual((ModelRun.objects.count(), CycloneTrack.objects.count()), (1, 1))

    def test_replace_loads_it_again_without_duplicating(self):
        self.send()
        response = self.send(replace="true")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(ModelRun.objects.count(), 1)
        self.assertEqual(ModelRun.objects.get().risk_information.count(), 9)

    def test_advisories_of_one_storm_share_an_event_and_the_newest_is_shown(self):
        self.send(cyclone_name="WATI_180600utc", base_time="2026-10-18T06:00:00Z")
        response = self.send(cyclone_name="WATI_181200utcWork", base_time="2026-10-18T12:00:00Z")

        self.assertEqual(Event.objects.count(), 1)
        self.assertEqual(Event.objects.get().cyclone_track.cyclone_name, "2026101812_Wati")
        self.assertTrue(response.data["shown"])

    def test_ignores_files_in_the_zip_that_are_not_outputs(self):
        content = run_zip(extra={"outputs/.DS_Store": b"x", "outputs/run.json": b"{}", "notes.txt": b"hi"})

        self.assertEqual(self.send(content).status_code, 201)

    # --- who may import

    def test_needs_a_login(self):
        response = self.send(client=APIClient())

        self.assertIn(response.status_code, (401, 403))
        self.assertEqual(ModelRun.objects.count(), 0)

    def test_needs_every_permission_an_import_uses(self):
        for codename in ("add_modelrun", "add_riskinformation", "add_cyclonetrack"):
            user = get_user_model().objects.create_user(f"without-{codename}")
            user.user_permissions.set(self.user.user_permissions.exclude(codename=codename))
            client = APIClient()
            client.force_authenticate(user)
            self.assertEqual(self.send(client=client).status_code, 403, codename)
        self.assertEqual(ModelRun.objects.count(), 0)

    # --- what is accepted

    def test_refuses_a_share_link_as_the_run_address(self):
        response = self.send(riskscape_run="https://riskscape.nz/shared/results/PgKk2nkswwOtfV9EZeP3qg==")

        self.assertEqual(response.status_code, 400)
        self.assertIn("riskscape_run", response.data)
        self.assertEqual(ModelRun.objects.count(), 0)

    def test_will_not_fetch_a_track_from_a_host_it_does_not_accept(self):
        for url in ("https://evil.example/cyclone_track/1/", "http://pacific-disaster-api.spc.int/cyclone_track/1/"):
            response = self.send(track_url=url)
            self.assertEqual(response.status_code, 400, url)
        self.http_get.assert_not_called()

    def test_will_not_follow_a_redirect_to_another_host(self):
        def redirected(url, **kwargs):
            reply = fake_http("2026101818_Wati", "2026-10-18T18:00:00Z")(url)
            reply.url = "https://internal.example/secret"
            return reply

        with mock.patch.object(rs, "http_get", redirected):
            response = self.api.post(
                URL,
                {
                    "country": "CK",
                    "track_url": TRACK_URL,
                    "outputs": SimpleUploadedFile("run.zip", run_zip(), "application/zip"),
                },
                format="multipart",
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("redirected", response.data["detail"])

    def test_refuses_something_that_is_not_a_zip(self):
        response = self.send(b"not a zip at all")

        self.assertEqual(response.status_code, 400)
        self.assertIn("not a zip", response.data["detail"])

    def test_refuses_a_zip_with_a_path_that_climbs_out(self):
        response = self.send(run_zip(extra={"../../evil.csv": b"x"}))

        self.assertEqual(response.status_code, 400)
        self.assertIn("Unsafe path", response.data["detail"])
        self.assertEqual(ModelRun.objects.count(), 0)

    def test_refuses_a_zip_with_too_many_files(self):
        with mock.patch.object(svc, "MAX_ARCHIVE_FILES", 3):
            response = self.send()

        self.assertEqual(response.status_code, 400)
        self.assertIn("more than 3 files", response.data["detail"])

    def test_refuses_a_zip_that_unpacks_too_large(self):
        with mock.patch.object(svc, "MAX_ARCHIVE_BYTES", 1000):
            response = self.send()

        self.assertEqual(response.status_code, 400)
        self.assertIn("too large", response.data["detail"])

    def test_refuses_two_files_with_the_same_name(self):
        response = self.send(run_zip(extra={"again/regional-summary.csv": b"x"}))

        self.assertEqual(response.status_code, 400)
        self.assertIn("two files named", response.data["detail"])

    def test_a_run_missing_an_output_leaves_nothing_behind(self):
        response = self.send(run_zip(skip=("regional-summary",)))

        self.assertEqual(response.status_code, 400)
        self.assertIn("regional-summary", response.data["detail"])
        self.assertEqual((CycloneTrack.objects.count(), ModelRun.objects.count(), Event.objects.count()), (0, 0, 0))

    def test_an_unknown_country_is_refused(self):
        response = self.send(country="XX")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(CycloneTrack.objects.count(), 0)

    def test_needs_the_zip_and_the_track(self):
        response = self.api.post(URL, {"country": "CK"}, format="multipart")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.data), {"track_url", "outputs"})
