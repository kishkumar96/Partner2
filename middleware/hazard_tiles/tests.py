import json
import os
import tempfile
from io import StringIO
from unittest import mock

import fsspec
import numpy as np
import xarray as xr
import zarr
from django.core.management import call_command
from django.core.management.base import CommandError
from django.http import Http404
from django.test import SimpleTestCase, override_settings

from hazard_tiles import store
from hazard_tiles.management.commands.publish_hazard_catalog import compare_decoded, compare_stores, convert_to_v2


def make_v3_store(path: str) -> None:
    """A small store shaped like the real one: a gridded depth array, some chunks never written."""
    depth = np.full((2, 2, 8, 8), np.nan, dtype="float32")
    depth[0, 1, :4, :4] = np.arange(16, dtype="float32").reshape(4, 4)
    depth[1, 0, 4:, 4:] = 7.5
    ds = xr.Dataset(
        {"depth": (("return_period", "slr", "y", "x"), depth)},
        coords={"return_period": [10, 100], "slr": [0.0, 0.25], "y": np.arange(8), "x": np.arange(8)},
        attrs={"epsg": 3832},
    )
    ds.to_zarr(path, group="probabilistic/tc", mode="w", zarr_format=3, encoding={"depth": {"chunks": (1, 1, 4, 4)}})
    labels = xr.Dataset({"depth": (("event", "slr"), np.zeros((2, 2), dtype="float32"))},
                        coords={"event": np.array(["2020-01-01", "2021-02-02"], dtype="<U10"), "slr": [0.0, 0.5]})
    labels.to_zarr(path, group="historical_tcs", mode="a", zarr_format=3)


class StoreLocationTests(SimpleTestCase):
    def test_defaults_to_the_folder_beside_the_code(self):
        with override_settings(HAZARD_CATALOG_STORE=""):
            self.assertTrue(store.store_location().endswith(os.path.join("data", "hazard_catalog.zarr")))
            self.assertFalse(store.is_remote(store.store_location()))

    def test_uses_the_configured_address(self):
        with override_settings(HAZARD_CATALOG_STORE="s3://bucket/hazard_catalog.zarr"):
            self.assertEqual(store.store_location(), "s3://bucket/hazard_catalog.zarr")
            self.assertTrue(store.is_remote(store.store_location()))

    def test_connection_options_come_from_the_environment_and_skip_what_is_unset(self):
        env = {"AWS_ACCESS_KEY_ID": "k", "AWS_SECRET_ACCESS_KEY": "s",
               "WASABI_ENDPOINT_URL": "https://s3.example", "AWS_DEFAULT_REGION": "ap-southeast-2"}
        with mock.patch.dict(os.environ, env, clear=True):
            self.assertEqual(store.s3_options(), {
                "key": "k", "secret": "s",
                "client_kwargs": {"endpoint_url": "https://s3.example", "region_name": "ap-southeast-2"},
            })
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(store.s3_options(), {})


class OpenGroupTests(SimpleTestCase):
    def test_opens_a_group_from_a_folder(self):
        with tempfile.TemporaryDirectory() as folder:
            make_v3_store(folder)
            ds = store.open_group("probabilistic/tc", folder)
            self.assertEqual(ds["depth"].dims, ("return_period", "slr", "y", "x"))
            self.assertEqual(float(ds["depth"].sel(return_period=100, slr=0.0).isel(y=5, x=5)), 7.5)

    def test_opens_a_remote_store_with_the_connection_options(self):
        env = {"AWS_ACCESS_KEY_ID": "k", "AWS_SECRET_ACCESS_KEY": "s", "WASABI_ENDPOINT_URL": "https://s3.example"}
        with mock.patch.dict(os.environ, env, clear=True), override_settings(HAZARD_CATALOG_CACHE_DIR=""), \
                mock.patch("hazard_tiles.store.xr.open_zarr") as opened:
            store.open_group("historical_tcs", "s3://bucket/hazard_catalog.zarr")
        opened.assert_called_once_with(
            "s3://bucket/hazard_catalog.zarr", group="historical_tcs",
            storage_options={"key": "k", "secret": "s", "client_kwargs": {"endpoint_url": "https://s3.example"}},
        )

    def test_keeps_fetched_chunks_on_disk_when_a_cache_folder_is_set(self):
        with mock.patch.dict(os.environ, {"AWS_ACCESS_KEY_ID": "k", "AWS_SECRET_ACCESS_KEY": "s"}, clear=True), \
                override_settings(HAZARD_CATALOG_CACHE_DIR="/tmp/chunk-cache"), \
                mock.patch("hazard_tiles.store.xr.open_zarr") as opened:
            store.open_group("historical_tcs", "s3://bucket/hazard_catalog.zarr")
        opened.assert_called_once_with(
            "simplecache::s3://bucket/hazard_catalog.zarr", group="historical_tcs",
            storage_options={"s3": {"key": "k", "secret": "s"}, "simplecache": {"cache_storage": "/tmp/chunk-cache"}},
        )

    def test_a_group_is_found_in_a_folder_and_in_a_remote_store(self):
        with tempfile.TemporaryDirectory() as folder:
            make_v3_store(folder)
            self.assertTrue(store.group_exists("probabilistic/tc", folder))
            self.assertFalse(store.group_exists("swell_driven", folder))
        memory = fsspec.filesystem("memory")
        memory.pipe("/groups-test.zarr/probabilistic/tc/.zgroup", b"{}")
        try:
            with mock.patch.dict(os.environ, {}, clear=True):
                self.assertTrue(store.group_exists("probabilistic/tc", "memory://groups-test.zarr"))
                self.assertFalse(store.group_exists("swell_driven", "memory://groups-test.zarr"))
        finally:
            memory.rm("/groups-test.zarr", recursive=True)


class ConvertTests(SimpleTestCase):
    def test_converts_to_v2_by_copying_chunks_and_every_block_matches(self):
        with tempfile.TemporaryDirectory() as work:
            source, converted = os.path.join(work, "v3.zarr"), os.path.join(work, "v2.zarr")
            make_v3_store(source)
            chunks = convert_to_v2(source, converted)
            self.assertGreater(chunks, 0)
            names = {os.path.relpath(os.path.join(r, f), converted) for r, _, fs in os.walk(converted) for f in fs}
            self.assertIn(".zmetadata", names)
            self.assertIn(os.path.join("probabilistic", "tc", "depth", ".zarray"), names)
            self.assertFalse([n for n in names if n.endswith("zarr.json")])
            arrays, blocks = compare_stores(source, converted)
            self.assertGreater(arrays, 3)
            self.assertGreater(blocks, 4)
            ds = xr.open_zarr(converted, group="probabilistic/tc")
            self.assertEqual(ds["depth"].dims, ("return_period", "slr", "y", "x"))
            self.assertEqual(float(ds["depth"].sel(return_period=10, slr=0.25).isel(y=1, x=2)), 6.0)
            labels = xr.open_zarr(converted, group="historical_tcs")
            self.assertEqual(labels["event"].values.tolist(), ["2020-01-01", "2021-02-02"])

    def test_real_zeros_stay_zeros_when_xarray_reads_the_copy(self):
        """A v2 fill value is read by xarray as missing data, so 0 m of sea-level rise and pixel index 0
        used to come back as NaN (and integer indexes as floats)."""
        with tempfile.TemporaryDirectory() as work:
            source, converted = os.path.join(work, "v3.zarr"), os.path.join(work, "v2.zarr")
            make_v3_store(source)
            convert_to_v2(source, converted)
            ds = xr.open_zarr(converted, group="probabilistic/tc")
            self.assertEqual(ds["slr"].values.tolist(), [0.0, 0.25])
            self.assertEqual(ds["x"].values.tolist(), list(range(8)))
            self.assertEqual(str(ds["x"].dtype), "int64")
            self.assertEqual(str(ds["return_period"].dtype), "int64")
            self.assertEqual(xr.open_zarr(converted, group="historical_tcs")["slr"].values.tolist(), [0.0, 0.5])
            self.assertEqual(compare_decoded(source, converted), 2)

    def test_the_decoded_check_notices_a_copy_that_xarray_reads_differently(self):
        with tempfile.TemporaryDirectory() as work:
            source, converted = os.path.join(work, "v3.zarr"), os.path.join(work, "v2.zarr")
            make_v3_store(source)
            convert_to_v2(source, converted)
            # what the unfixed copy was like: a 0.0 fill value, which xarray reads as missing data
            # (the consolidated metadata is removed so that xarray reads the edited array metadata)
            os.remove(os.path.join(converted, ".zmetadata"))
            array_meta = os.path.join(converted, "probabilistic", "tc", "slr", ".zarray")
            meta = json.load(open(array_meta))
            meta["fill_value"] = 0.0
            json.dump(meta, open(array_meta, "w"))
            with self.assertRaisesMessage(CommandError, "xarray reads"):
                compare_decoded(source, converted)

    def test_refuses_a_store_that_is_not_v3(self):
        with tempfile.TemporaryDirectory() as work:
            zarr.open_group(work, mode="w", zarr_format=2)
            with self.assertRaisesMessage(CommandError, "converts v3 stores"):
                convert_to_v2(work, os.path.join(work, "out"))


class PublishCommandTests(SimpleTestCase):
    def setUp(self):
        self._memory = fsspec.filesystem("memory")
        self.addCleanup(lambda: [self._memory.rm(p, recursive=True) for p in ("/pub-a.zarr", "/pub-b.zarr", "/pub-c.zarr")
                                 if self._memory.exists(p)])
        self._env = mock.patch.dict(os.environ, {}, clear=True)
        self._env.start()
        self.addCleanup(self._env.stop)

    def publish(self, destination, source, *extra):
        out = StringIO()
        call_command("publish_hazard_catalog", destination, "--source", source, *extra, stdout=out)
        return out.getvalue()

    def test_dry_run_converts_and_verifies_but_uploads_nothing(self):
        with tempfile.TemporaryDirectory() as work:
            make_v3_store(work)
            text = self.publish("memory://pub-a.zarr", work, "--dry-run")
        self.assertIn("Verified", text)
        self.assertIn("nothing uploaded", text)
        self.assertFalse(self._memory.exists("/pub-a.zarr"))

    def test_publishes_a_store_that_reads_back_identically(self):
        with tempfile.TemporaryDirectory() as work:
            make_v3_store(work)
            text = self.publish("memory://pub-b.zarr", work)
            original = store.open_group("probabilistic/tc", work)["depth"].values
        self.assertIn("names and sizes match", text)
        self.assertTrue(self._memory.exists("/pub-b.zarr/.zmetadata"))
        again = store.open_group("probabilistic/tc", "memory://pub-b.zarr")["depth"].values
        self.assertTrue(np.array_equal(original, again, equal_nan=True))

    def test_leaves_an_existing_store_alone_unless_told_to_replace_it(self):
        with tempfile.TemporaryDirectory() as work:
            make_v3_store(work)
            self.publish("memory://pub-c.zarr", work)
            with self.assertRaisesMessage(CommandError, "pass --replace"):
                self.publish("memory://pub-c.zarr", work)
            self._memory.pipe("/pub-c.zarr/stale-file", b"x")
            self.publish("memory://pub-c.zarr", work, "--replace")
        self.assertFalse(self._memory.exists("/pub-c.zarr/stale-file"))
        self.assertTrue(self._memory.exists("/pub-c.zarr/.zmetadata"))


class ZarrPassThroughTests(SimpleTestCase):
    """The hazard_zarr endpoint hands the store's objects to the frontend, read-only, with byte ranges."""

    def setUp(self):
        from django.test import RequestFactory

        from hazard_tiles import views

        self.views, self.rf = views, RequestFactory()
        self.work = tempfile.TemporaryDirectory()
        self.addCleanup(self.work.cleanup)
        source = os.path.join(self.work.name, "v3.zarr")
        self.store = os.path.join(self.work.name, "v2.zarr")
        make_v3_store(source)
        convert_to_v2(source, self.store)
        patcher = mock.patch("hazard_tiles.views.STORE_PATH", self.store)
        patcher.start()
        self.addCleanup(patcher.stop)
        # the first chunk that exists
        chunk_dir = os.path.join(self.store, "probabilistic", "tc", "depth")
        self.chunk = next(n for n in sorted(os.listdir(chunk_dir)) if n[0].isdigit())
        self.chunk_key = f"probabilistic/tc/depth/{self.chunk}"
        self.chunk_bytes = open(os.path.join(chunk_dir, self.chunk), "rb").read()

    def get(self, key, method="get", **headers):
        request = getattr(self.rf, method)(f"/partner_api/v1/hazard_zarr/{key}", **headers)
        return self.views.hazard_zarr(request, key)

    def test_serves_metadata_as_json_and_chunks_as_the_exact_stored_bytes(self):
        meta = self.get(".zmetadata")
        self.assertEqual((meta.status_code, meta["Content-Type"]), (200, "application/json"))
        self.assertIn(b"probabilistic/tc/depth/.zarray", meta.content)
        chunk = self.get(self.chunk_key)
        self.assertEqual((chunk.status_code, chunk["Content-Type"]), (200, "application/octet-stream"))
        self.assertEqual(chunk.content, self.chunk_bytes)
        self.assertEqual(chunk["Content-Length"], str(len(self.chunk_bytes)))
        self.assertEqual(chunk["Accept-Ranges"], "bytes")
        self.assertIn("max-age=", chunk["Cache-Control"])

    def test_head_describes_the_object_without_sending_it(self):
        response = self.get(self.chunk_key, method="head")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"")
        self.assertEqual(response["Content-Length"], str(len(self.chunk_bytes)))

    def test_byte_ranges(self):
        size = len(self.chunk_bytes)
        first = self.get(self.chunk_key, HTTP_RANGE="bytes=0-9")
        self.assertEqual((first.status_code, first.content), (206, self.chunk_bytes[:10]))
        self.assertEqual(first["Content-Range"], f"bytes 0-9/{size}")
        self.assertEqual(first["Content-Length"], "10")
        open_ended = self.get(self.chunk_key, HTTP_RANGE="bytes=5-")
        self.assertEqual((open_ended.status_code, open_ended.content), (206, self.chunk_bytes[5:]))
        suffix = self.get(self.chunk_key, HTTP_RANGE="bytes=-7")
        self.assertEqual((suffix.status_code, suffix.content), (206, self.chunk_bytes[-7:]))
        past_end = self.get(self.chunk_key, HTTP_RANGE=f"bytes={size + 100}-")
        self.assertEqual((past_end.status_code, past_end["Content-Range"]), (416, f"bytes */{size}"))
        self.assertEqual(self.get(self.chunk_key, HTTP_RANGE="bytes=a-b").status_code, 416)
        clipped = self.get(self.chunk_key, HTTP_RANGE=f"bytes=0-{size + 500}")
        self.assertEqual((clipped.status_code, clipped.content), (206, self.chunk_bytes))

    def test_refuses_anything_that_is_not_a_zarr_object(self):
        for key in (
            "a/../.zmetadata", "../.zmetadata", "/etc/passwd", "x//.zarray", "probabilistic/tc/depth/",
            "probabilistic/tc/depth/secret.txt", "probabilistic/tc/depth/0.0.0.1.json", "probabilistic/.git/.zarray",
            "probabilistic\\tc/.zarray", "probabilistic/tc/depth/0.0.0.1\x00",
        ):
            with self.subTest(key=key), self.assertRaises(Http404):
                self.get(key)

    def test_a_well_formed_name_that_is_not_in_the_store_is_not_found(self):
        with self.assertRaises(Http404):
            self.get("probabilistic/tc/depth/99.99.99.99")
        with self.assertRaises(Http404):
            self.get("no_such_group/.zgroup")

    def test_is_read_only(self):
        request = self.rf.post("/partner_api/v1/hazard_zarr/.zmetadata", data={})
        self.assertEqual(self.views.hazard_zarr(request, ".zmetadata").status_code, 405)

    def test_serves_a_store_held_on_object_storage(self):
        memory = fsspec.filesystem("memory")
        memory.pipe("/zarr-pass.zarr/probabilistic/tc/depth/0.0.0.0", b"0123456789")
        memory.pipe("/zarr-pass.zarr/.zmetadata", b"{}")
        self.addCleanup(lambda: memory.rm("/zarr-pass.zarr", recursive=True))
        with mock.patch("hazard_tiles.views.STORE_PATH", "memory://zarr-pass.zarr"), mock.patch.dict(os.environ, {}, clear=True):
            whole = self.get("probabilistic/tc/depth/0.0.0.0")
            part = self.get("probabilistic/tc/depth/0.0.0.0", HTTP_RANGE="bytes=2-5")
        self.assertEqual(whole.content, b"0123456789")
        self.assertEqual((part.status_code, part.content), (206, b"2345"))

    def test_is_routed_under_the_partner_api(self):
        from django.urls import resolve

        match = resolve("/partner_api/v1/hazard_zarr/probabilistic/tc/depth/.zarray")
        self.assertIs(match.func, self.views.hazard_zarr)
        self.assertEqual(match.kwargs, {"key": "probabilistic/tc/depth/.zarray"})
