import json
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from country.models import Country

from .models import CycloneTrack

LINE = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {},
            "geometry": {"type": "LineString", "coordinates": [[169.4, -12.7], [168.0, -16.0], [190.0, -20.0]]},
        }
    ],
}


def geojson_file(data, name="cyclone-track.geojson"):
    return SimpleUploadedFile(name, json.dumps(data).encode(), content_type="application/geo+json")


class GeojsonTrackTests(TestCase):
    def setUp(self):
        media = tempfile.TemporaryDirectory()
        self.addCleanup(media.cleanup)
        override = override_settings(MEDIA_ROOT=media.name)
        override.enable()
        self.addCleanup(override.disable)

    def test_a_line_becomes_one_point_per_vertex_with_latitude_and_longitude(self):
        track = CycloneTrack.objects.create(cyclone_name="2026101912_Wati", track_file=geojson_file(LINE))
        track.refresh_from_db()
        self.assertTrue(track.geometry_computed)
        points = track.geometry["features"]
        self.assertEqual(len(points), 3)
        self.assertEqual(points[0]["geometry"]["coordinates"], [169.4, -12.7])
        self.assertEqual((points[1]["properties"]["Latitude"], points[1]["properties"]["Longitude"]), (-16.0, 168.0))
        self.assertEqual(points[2]["geometry"]["coordinates"][0], -170.0)  # longitude wrapped past 180

    def test_a_file_with_no_track_is_stored_without_geometry(self):
        empty = {"type": "FeatureCollection", "features": []}
        track = CycloneTrack.objects.create(cyclone_name="x", track_file=geojson_file(empty))
        track.refresh_from_db()
        self.assertFalse(track.geometry_computed)
        self.assertIsNone(track.geometry)

    def test_a_file_that_is_not_json_is_stored_without_geometry(self):
        track = CycloneTrack.objects.create(
            cyclone_name="x", track_file=SimpleUploadedFile("t.geojson", b"not json")
        )
        track.refresh_from_db()
        self.assertFalse(track.geometry_computed)


class PostGeojsonTrackApiTests(APITestCase):
    def test_posting_a_geojson_track_creates_it_with_its_geometry(self):
        user = get_user_model().objects.create_user("poster", password="x")
        self.client.force_authenticate(user)
        ck = Country.objects.get(code="CK")
        with tempfile.TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media):
            response = self.client.post(
                "/partner_api/v1/cyclone_track/",
                {
                    "cyclone_name": "2026101912_Wati",
                    "issued_time": "2026-10-19T12:00:00Z",
                    "country": ck.pk,
                    "track_file": geojson_file(LINE),
                },
                format="multipart",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
            track = CycloneTrack.objects.get(pk=response.data["id"])
        self.assertTrue(track.geometry_computed)
        self.assertEqual(len(track.geometry["features"]), 3)
        self.assertEqual(track.country, ck)
