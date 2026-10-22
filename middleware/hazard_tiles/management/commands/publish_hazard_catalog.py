"""Publishes the hazard catalogue Zarr store to S3-compatible storage (Wasabi) as Zarr v2.

    manage.py publish_hazard_catalog s3://spc-zarr-file/hazard_catalog.zarr
    manage.py publish_hazard_catalog s3://spc-zarr-file/hazard_catalog.zarr --dry-run
    manage.py publish_hazard_catalog s3://... --source /path/to/hazard_catalog.zarr --replace

The store on disk is Zarr v3 made of ``bytes`` + ``zstd`` arrays. A v3 chunk is the same compressed
bytes as a v2 chunk under a different name, so the chunks are copied unchanged and only the metadata
is rewritten (dimension names become ``_ARRAY_DIMENSIONS``, which xarray reads). Nothing is
re-encoded. Before anything is uploaded every block of the result is compared with the original;
after it, the names and sizes in the bucket are compared with what was sent.

Chunk files go up first and the metadata last, so a reader never finds metadata that points at
chunks which are not there yet. The destination is the same ``s3://`` address
``HAZARD_CATALOG_STORE`` takes; the endpoint and keys come from the environment (hazard_tiles/store.py).
"""

import itertools
import math
import os
import shutil
import tempfile

import fsspec
import numcodecs
import numpy as np
import zarr
from django.core.management.base import BaseCommand, CommandError
from zarr.codecs import BytesCodec, ZstdCodec

from hazard_tiles import store

METADATA_FILES = (".zarray", ".zgroup", ".zattrs", ".zmetadata")


def is_metadata(relative_path: str) -> bool:
    return relative_path.rsplit("/", 1)[-1] in METADATA_FILES


def convert_to_v2(source: str, target: str) -> int:
    """Write a Zarr v2 copy of the v3 store at ``source`` into ``target``; returns the chunk count."""
    src = zarr.open_group(source, mode="r")
    if src.metadata.zarr_format != 3:
        raise CommandError(f"{source} is Zarr v{src.metadata.zarr_format}; this converts v3 stores.")
    dst = zarr.open_group(target, mode="w", zarr_format=2)
    dst.attrs.update(dict(src.attrs))
    copied = 0

    def walk(sgroup, dgroup, relative):
        nonlocal copied
        for name, node in sgroup.members():
            path = f"{relative}/{name}" if relative else name
            if isinstance(node, zarr.Group):
                walk(node, dgroup.create_group(name, attributes=dict(node.attrs)), path)
                continue
            codecs = node.metadata.codecs
            if [type(c) for c in codecs] != [BytesCodec, ZstdCodec]:
                raise CommandError(
                    f"{path}: codecs {[type(c).__name__ for c in codecs]} cannot be copied unchanged "
                    "(expected bytes + zstd)."
                )
            if codecs[0].endian is not None and codecs[0].endian.value != "little":
                raise CommandError(f"{path}: not little-endian.")
            fill = node.fill_value
            if isinstance(fill, (float, np.floating)) and np.isnan(fill):
                v2_fill = fill  # NaN means "no data" either way
            elif not fill:
                # v3 uses 0 / 0.0 / "" only for chunks never written. In v2, xarray reads the same
                # field as a missing-data marker and would turn every real 0 (a 0 m sea-level rise,
                # pixel index 0) into NaN, so it is left unset: never-written chunks still read as 0.
                v2_fill = None
            else:
                raise CommandError(
                    f"{path}: fill value {fill!r} would be read as missing data by xarray in Zarr v2."
                )
            attrs = dict(node.attrs)
            dims = getattr(node.metadata, "dimension_names", None)
            if dims:
                attrs["_ARRAY_DIMENSIONS"] = list(dims)
            dgroup.create_array(
                name, shape=node.shape, chunks=node.chunks, dtype=node.dtype,
                fill_value=v2_fill, filters=None,
                compressors=numcodecs.Zstd(level=codecs[1].level), attributes=attrs,
            )
            chunk_root = os.path.join(source, path, "c")
            for folder, _, files in os.walk(chunk_root):
                for filename in files:
                    index = os.path.relpath(os.path.join(folder, filename), chunk_root).split(os.sep)
                    shutil.copyfile(os.path.join(folder, filename), os.path.join(target, path, ".".join(index)))
                    copied += 1

    walk(src, dst, "")
    zarr.consolidate_metadata(target, zarr_format=2)
    return copied


def arrays_of(group, prefix=""):
    for name, node in group.members():
        path = f"{prefix}/{name}" if prefix else name
        if isinstance(node, zarr.Group):
            yield from arrays_of(node, path)
        else:
            yield path, node


def compare_stores(source: str, converted: str) -> tuple[int, int]:
    """Compare every block of every array. Returns (arrays, blocks); raises on the first difference."""
    a, b = zarr.open_group(source, mode="r"), zarr.open_group(converted, mode="r")
    arrays = blocks = 0
    for path, original in arrays_of(a):
        copy = b[path]
        if (original.shape, original.dtype, original.chunks) != (copy.shape, copy.dtype, copy.chunks):
            raise CommandError(f"{path}: shape, type or chunking differs after conversion")
        grid = [math.ceil(s / c) for s, c in zip(original.shape, original.chunks)]
        for index in itertools.product(*[range(n) for n in grid]):
            window = tuple(
                slice(i * c, min((i + 1) * c, s)) for i, c, s in zip(index, original.chunks, original.shape)
            )
            x, y = original[window], copy[window]
            same = np.array_equal(x, y, equal_nan=True) if x.dtype.kind == "f" else np.array_equal(x, y)
            if not same:
                raise CommandError(f"{path}: block {index} differs after conversion")
            blocks += 1
        arrays += 1
    return arrays, blocks


def compare_decoded(source: str, converted: str) -> int:
    """Compare what xarray decodes from each group's coordinates and variables in the two stores.

    The raw arrays can match while xarray reads them differently (a fill value read as missing data
    turns a real 0 into NaN and an integer index into floats), so the check has to go through it.
    Returns the number of groups compared.
    """
    import xarray as xr

    groups = 0
    seen = set()
    for path, _ in arrays_of(zarr.open_group(source, mode="r")):
        group = path.rsplit("/", 1)[0] if "/" in path else ""
        if group in seen:
            continue
        seen.add(group)
        a, b = xr.open_zarr(source, group=group or None), xr.open_zarr(converted, group=group or None)
        for name in list(a.coords) + list(a.data_vars):
            if (a[name].dtype, a[name].dims) != (b[name].dtype, b[name].dims):
                raise CommandError(
                    f"{group}/{name}: xarray reads {a[name].dtype} {a[name].dims} from the original but "
                    f"{b[name].dtype} {b[name].dims} from the copy"
                )
        for name in a.coords:
            x, y = a[name].values, b[name].values
            if not np.array_equal(x, y, equal_nan=x.dtype.kind == "f"):
                raise CommandError(f"{group}/{name}: xarray reads different values from the copy: {x[:3]} vs {y[:3]}")
        if a.attrs != b.attrs:
            raise CommandError(f"{group}: attributes differ after conversion")
        groups += 1
    return groups


def local_files(folder: str) -> dict[str, int]:
    found = {}
    for root, _, names in os.walk(folder):
        for name in names:
            found[os.path.relpath(os.path.join(root, name), folder).replace(os.sep, "/")] = os.path.getsize(
                os.path.join(root, name)
            )
    return found


def remote_files(fs, root: str) -> dict[str, int]:
    """Every object under ``root`` and its size, from one listing."""
    if not fs.exists(root):
        return {}
    prefix = root.rstrip("/") + "/"
    return {
        path[len(prefix):]: info["size"]
        for path, info in fs.find(root, detail=True).items()
        if info.get("type", "file") == "file"
    }


class Command(BaseCommand):
    help = "Convert the hazard catalogue Zarr store to v2, verify it, and upload it to S3-compatible storage."

    def add_arguments(self, parser):
        parser.add_argument("destination", help="where to publish it, e.g. s3://spc-zarr-file/hazard_catalog.zarr")
        parser.add_argument("--source", default=None, help="the v3 store to publish (default: the configured store)")
        parser.add_argument("--dry-run", action="store_true", help="convert and verify, upload nothing")
        parser.add_argument(
            "--replace", action="store_true",
            help="delete what is already at the destination first (by default an existing store is left alone)",
        )

    def handle(self, *args, **options):
        source = options["source"] or store.store_location()
        if store.is_remote(source):
            raise CommandError("--source must be a folder on disk")
        destination = options["destination"].rstrip("/")

        fs, root = fsspec.core.url_to_fs(destination, **store.s3_options())
        existing = remote_files(fs, root)
        if existing and not options["replace"] and not options["dry_run"]:
            raise CommandError(f"{destination} already has {len(existing)} objects; pass --replace to publish over it.")

        with tempfile.TemporaryDirectory() as workdir:
            converted = os.path.join(workdir, "hazard_catalog_v2.zarr")
            chunks = convert_to_v2(source, converted)
            self.stdout.write(f"Converted {source} to Zarr v2: {chunks} chunk files copied unchanged.")
            arrays, blocks = compare_stores(source, converted)
            self.stdout.write(f"Verified: {arrays} arrays, {blocks} blocks, all identical to the original.")
            groups = compare_decoded(source, converted)
            self.stdout.write(f"Verified: xarray reads the coordinates of all {groups} groups exactly as before.")

            files = local_files(converted)
            ordered = sorted(f for f in files if not is_metadata(f)) + sorted(
                (f for f in files if is_metadata(f)), key=lambda f: (f.endswith(".zmetadata"), f == ".zgroup")
            )
            self.stdout.write(f"{len(files)} files, {sum(files.values()) / 1e6:.1f} MB.")
            if options["dry_run"]:
                self.stdout.write("Dry run: nothing uploaded.")
                return

            if existing:
                fs.rm(root, recursive=True)
                self.stdout.write(f"Removed the {len(existing)} existing objects at {destination}.")
            for relative in ordered:
                target = f"{root.rstrip('/')}/{relative}"
                fs.makedirs(target.rsplit("/", 1)[0], exist_ok=True)
                fs.put_file(os.path.join(converted, relative), target)

        uploaded = remote_files(fs, root)
        missing = sorted(set(files) - set(uploaded))
        unexpected = sorted(set(uploaded) - set(files))
        wrong = sorted(k for k in files if k in uploaded and files[k] != uploaded[k])
        if missing or unexpected or wrong:
            raise CommandError(f"Upload check failed: missing {missing[:5]}, unexpected {unexpected[:5]}, sizes {wrong[:5]}")
        self.stdout.write(self.style.SUCCESS(f"Published {len(uploaded)} objects to {destination}; names and sizes match."))
