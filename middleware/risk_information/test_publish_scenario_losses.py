import gzip
import hashlib
import io
import json
import os
import tempfile

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from country.models import Country

from .management.commands.publish_scenario_losses import iter_files
from .models import RiskInformation, RiskScenario, RiskScenarioBreakdown
from .serializers import RiskScenarioBreakdownSerializer, RiskScenarioSerializer
from .tests import make_upload


def read(folder, relative):
    with open(os.path.join(folder, relative), "rb") as handle:
        return json.loads(gzip.decompress(handle.read()))


class PublishScenarioLossesTests(TestCase):
    def setUp(self):
        # the migrations seed the countries, so look them up by their canonical code
        self.ck, _ = Country.objects.get_or_create(code="CK", defaults={"short_name": "CK", "long_name": "Cook Islands"})
        self.vu, _ = Country.objects.get_or_create(code="VU", defaults={"short_name": "VU", "long_name": "Vanuatu"})
        self.tc = RiskInformation.objects.create(
            title="CK tc national impact", country=self.ck, upload=make_upload("tc.geojson")
        )
        self.swell = RiskInformation.objects.create(
            title="CK swell national impact", country=self.ck, upload=make_upload("swell.geojson")
        )
        self.vu_info = RiskInformation.objects.create(
            title="VU tc national impact", country=self.vu, upload=make_upload("vu.geojson")
        )
        self.rp100 = RiskScenario.objects.create(
            risk_information=self.tc, slr_scenario_m=0.5, return_period_years=100, total_loss=1000.5
        )
        self.aal = RiskScenario.objects.create(
            risk_information=self.tc, slr_scenario_m=0.5, is_annual_average_loss=True, total_loss=40.25
        )
        self.swell_event = RiskScenario.objects.create(
            risk_information=self.swell, slr_scenario_m=0.0, event_label="2018-03-01", total_loss=7.0
        )
        self.vu_scenario = RiskScenario.objects.create(
            risk_information=self.vu_info, slr_scenario_m=0.0, return_period_years=50, total_loss=3.0
        )
        for name, loss in [("Build-Residential", 600.25), ("Build-Commercial", 400.25)]:
            RiskScenarioBreakdown.objects.create(
                risk_scenario=self.rp100, dimension="sector", name=name, total_loss=loss
            )
        RiskScenarioBreakdown.objects.create(
            risk_scenario=self.aal, dimension="asset_type", name="Houses", sector="Housing", total_loss=40.25
        )

    def publish(self, folder, *extra):
        out = io.StringIO()
        call_command("publish_scenario_losses", folder, *extra, stdout=out)
        return out.getvalue()

    def test_writes_one_scenario_file_per_country_in_the_serializers_shape(self):
        with tempfile.TemporaryDirectory() as folder:
            self.publish(folder)
            rows = read(folder, "CK/scenarios.json")
            self.assertEqual({row["id"] for row in rows}, {self.rp100.pk, self.aal.pk, self.swell_event.pk})
            expected = {r["id"]: r for r in json.loads(json.dumps(RiskScenarioSerializer(
                RiskScenario.objects.filter(pk__in=[self.rp100.pk, self.aal.pk, self.swell_event.pk]), many=True
            ).data))}
            for row in rows:
                self.assertEqual(row, expected[row["id"]])
            self.assertEqual({row["country"] for row in read(folder, "VU/scenarios.json")}, {self.vu.pk})

    def test_groups_each_products_breakdown_by_scenario(self):
        with tempfile.TemporaryDirectory() as folder:
            self.publish(folder)
            grouped = read(folder, f"CK/breakdown/{self.tc.pk}.json")
            self.assertEqual(set(grouped), {str(self.rp100.pk), str(self.aal.pk)})
            self.assertEqual(sorted(r["name"] for r in grouped[str(self.rp100.pk)]), ["Build-Commercial", "Build-Residential"])
            expected = json.loads(json.dumps(RiskScenarioBreakdownSerializer(
                RiskScenarioBreakdown.objects.filter(risk_scenario=self.aal), many=True
            ).data))
            self.assertEqual(grouped[str(self.aal.pk)], expected)

    def test_a_product_without_breakdown_rows_has_no_breakdown_file_but_is_in_the_manifest(self):
        with tempfile.TemporaryDirectory() as folder:
            self.publish(folder)
            self.assertFalse(os.path.exists(os.path.join(folder, f"CK/breakdown/{self.swell.pk}.json")))
            manifest = json.load(open(os.path.join(folder, "manifest.json")))
            self.assertEqual(manifest["countries"]["CK"]["products"][str(self.swell.pk)]["breakdown_rows"], 0)

    def test_manifest_counts_and_totals_match_the_data(self):
        with tempfile.TemporaryDirectory() as folder:
            self.publish(folder)
            manifest = json.load(open(os.path.join(folder, "manifest.json")))
            self.assertEqual(manifest["version"], 1)
            ck = manifest["countries"]["CK"]
            self.assertEqual(ck["scenarios"], 3)
            self.assertEqual(ck["total_loss"], 1047.75)
            tc = ck["products"][str(self.tc.pk)]
            self.assertEqual((tc["scenarios"], tc["breakdown_rows"], tc["breakdown_loss"]), (2, 3, 1040.75))
            for name, info in manifest["files"].items():
                with open(os.path.join(folder, name), "rb") as handle:
                    data = handle.read()
                self.assertEqual((info["bytes"], info["sha256"]), (len(data), hashlib.sha256(data).hexdigest()))

    def test_publishing_the_same_data_twice_gives_identical_files(self):
        first = dict(iter_files({"countries": {}}))
        second = dict(iter_files({"countries": {}}))
        self.assertEqual(first, second)

    def test_dry_run_writes_nothing(self):
        with tempfile.TemporaryDirectory() as folder:
            out = self.publish(folder, "--dry-run")
            self.assertIn("Dry run", out)
            self.assertEqual(os.listdir(folder), [])

    def test_will_not_publish_over_existing_files_without_replace(self):
        with tempfile.TemporaryDirectory() as folder:
            self.publish(folder)
            with self.assertRaises(CommandError):
                self.publish(folder)
            self.assertIn("Published", self.publish(folder, "--replace"))

    def test_refuses_when_there_are_no_scenarios(self):
        RiskScenario.objects.all().delete()
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(CommandError):
                self.publish(folder)
