"""Where the hazard catalogue Zarr store lives, and how to open one of its groups.

By default the store is a folder next to the code (``data/hazard_catalog.zarr``). Set
``HAZARD_CATALOG_STORE`` to an ``s3://bucket/name.zarr`` address to read it from S3-compatible
storage (Wasabi) instead. The endpoint and keys come from the environment, the same names the
project's ``wasabi.env`` uses:

    WASABI_ENDPOINT_URL      e.g. https://s3.ap-southeast-2.wasabisys.com
    AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
    AWS_DEFAULT_REGION

A tile touches a few chunks, each a separate request to the bucket. ``HAZARD_CATALOG_CACHE_DIR``
keeps the chunks it has fetched on local disk, so a tile drawn once is not fetched again. The cache
is never refreshed by itself: empty the folder after the store in the bucket is replaced.
"""

import os

import xarray as xr
from django.conf import settings


def default_location() -> str:
    return os.path.join(settings.BASE_DIR, "data", "hazard_catalog.zarr")


def store_location() -> str:
    """The configured store: a folder path, or an s3:// address."""
    return str(getattr(settings, "HAZARD_CATALOG_STORE", "") or default_location())


def is_remote(location: str) -> bool:
    return "://" in location


def s3_options() -> dict:
    """Connection settings for s3fs, from the environment. Empty values are left out."""
    options: dict = {}
    key, secret = os.environ.get("AWS_ACCESS_KEY_ID"), os.environ.get("AWS_SECRET_ACCESS_KEY")
    if key and secret:
        options["key"], options["secret"] = key, secret
    client: dict = {}
    if os.environ.get("WASABI_ENDPOINT_URL"):
        client["endpoint_url"] = os.environ["WASABI_ENDPOINT_URL"]
    if os.environ.get("AWS_DEFAULT_REGION"):
        client["region_name"] = os.environ["AWS_DEFAULT_REGION"]
    if client:
        options["client_kwargs"] = client
    return options


def _remote(location: str) -> tuple[str, dict]:
    """The address to open and its options; with a cache folder, chunks are kept on local disk."""
    scheme = location.split("://", 1)[0]
    options = s3_options()
    cache_dir = str(getattr(settings, "HAZARD_CATALOG_CACHE_DIR", "") or "")
    if cache_dir:
        return f"simplecache::{location}", {scheme: options, "simplecache": {"cache_storage": cache_dir}}
    return location, options


def _filesystem(location: str):
    """The fsspec filesystem and the store's root path in it, for a folder or an s3:// address."""
    import fsspec

    if is_remote(location):
        return fsspec.core.url_to_fs(location, **s3_options())
    return fsspec.filesystem("file"), os.path.abspath(location)


def object_size(key: str, location: str | None = None) -> int | None:
    """Size in bytes of one object of the store (``key`` relative to its root), or None if absent."""
    fs, root = _filesystem(location or store_location())
    path = f"{root.rstrip('/')}/{key}"
    try:
        info = fs.info(path)
    except FileNotFoundError:
        return None
    return info["size"] if info.get("type", "file") == "file" else None


def read_object(key: str, start: int | None = None, end: int | None = None, location: str | None = None) -> bytes:
    """Bytes ``[start, end)`` of one object of the store (the whole object by default)."""
    fs, root = _filesystem(location or store_location())
    return fs.cat_file(f"{root.rstrip('/')}/{key}", start=start, end=end)


def group_exists(group: str, location: str | None = None) -> bool:
    """Whether the store has this group (Zarr v2 ``.zgroup`` or v3 ``zarr.json``)."""
    location = location or store_location()
    if not is_remote(location):
        return os.path.isdir(os.path.join(location, *group.split("/")))
    import fsspec

    fs, root = fsspec.core.url_to_fs(location, **s3_options())
    base = f"{root.rstrip('/')}/{group}"
    return bool(fs.exists(f"{base}/.zgroup") or fs.exists(f"{base}/zarr.json"))


def open_group(group: str, location: str | None = None) -> xr.Dataset:
    """One group of the store as an xarray dataset (lazy: no chunk is read until it is used)."""
    location = location or store_location()
    if not is_remote(location):
        return xr.open_zarr(location, group=group)
    url, options = _remote(location)
    return xr.open_zarr(url, group=group, storage_options=options or None)
