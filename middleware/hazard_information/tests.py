from rest_framework import status
from rest_framework.test import APITestCase

from country.models import Country

from .models import HazardInformation


class HazardInformationCountryFilterTests(APITestCase):
    """Same regression class as risk_information's country-filter bug
    (d007985): the list view must declare "country" in filterset_fields,
    or ?country= is silently ignored and every request returns every
    country's rows. HazardInformationListView already does this
    correctly (see the code comment in risk_information/views.py) -- this
    guards against that ever regressing."""

    def setUp(self):
        self.ck = Country.objects.create(short_name="CK", long_name="Cook Islands")
        self.vu = Country.objects.create(short_name="VU", long_name="Vanuatu")
        self.ck_row = HazardInformation.objects.create(
            title="CK combined_slr0.25_rp100",
            protocol="xyz",
            url="https://example.spc.int/hazard_tiles/combined/0.25/100/{z}/{x}/{y}.png",
            country=self.ck,
        )
        self.vu_row = HazardInformation.objects.create(
            title="VU TC Harold wind",
            protocol="WMS",
            url="https://gemthreddshpc.spc.int/thredds/wms/vu_hazard/TC/Harold/_merged.nc",
            country=self.vu,
        )
        self.list_url = "/partner_api/v1/hazard_information/"

    def test_country_filter_returns_only_that_countrys_rows(self):
        response = self.client.get(self.list_url, {"country": self.ck.pk})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [row["id"] for row in response.data]
        self.assertEqual(ids, [self.ck_row.pk])

    def test_different_country_filter_returns_only_its_own_rows(self):
        response = self.client.get(self.list_url, {"country": self.vu.pk})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [row["id"] for row in response.data]
        self.assertEqual(ids, [self.vu_row.pk])

    def test_no_country_filter_returns_all_countries(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in response.data}
        self.assertEqual(ids, {self.ck_row.pk, self.vu_row.pk})


class PopulateHazardCatalogTests(APITestCase):
    """A store that is only partly uploaded loads what is there and reports the rest."""

    def test_skips_groups_missing_from_the_store_and_stores_the_public_tile_address(self):
        import tempfile
        from io import StringIO
        from unittest import mock

        import numpy as np
        import xarray as xr
        from django.core.management import call_command

        ck = Country.objects.get(code="CK")
        before = HazardInformation.objects.filter(country=ck).count()
        with tempfile.TemporaryDirectory() as store:
            ds = xr.Dataset(
                {"depth": (("slr", "return_period"), np.zeros((1, 2)))},
                coords={"slr": [0.25], "return_period": [10, 100]},
            )
            ds.to_zarr(store, group="probabilistic/combined", mode="w")
            out, err = StringIO(), StringIO()
            with mock.patch(
                "hazard_information.management.commands.populate_hazard_catalog.STORE_PATH", store
            ):
                call_command("populate_hazard_catalog", "--base-url", "https://tiles.example/", stdout=out, stderr=err)

        rows = HazardInformation.objects.filter(country=ck, layer_name__startswith="combined_")
        self.assertEqual(HazardInformation.objects.filter(country=ck).count() - before, 2)
        self.assertEqual(rows.count(), 2)
        self.assertTrue(all(r.url.startswith("https://tiles.example/partner_api/v1/hazard_tiles/") for r in rows))
        self.assertIn("skipping 'swell_driven'", err.getvalue())
        self.assertIn("Created 2", out.getvalue())
