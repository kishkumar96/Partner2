"""Builds hazard_zarr_mini/, a tiny Zarr v2 store shaped like the published hazard catalogue.

    python make_hazard_zarr_mini.py        (needs zarr>=3, numcodecs, numpy)

Layout and values are deterministic, so the tests can compute what every cell must hold:
    probabilistic/tc/depth[return_period, slr, y, x] = rp_index*100 + slr_index*10 + y + x/10   (float32)
    chunks are (2, 1, 3, 5) on a (4, 2, 6, 10) array; the chunk at index 1.1.1.1 is left out (reads as NaN)
    historical_tcs/depth[event, slr, y, x] = event_index*1000 + slr_index*10 + y + x/10, chunks (1, 1, 6, 10)
Coordinates include real zeros (slr 0.0, pixel index 0), the case xarray used to read as missing data.
"""
import json, os, shutil
import numcodecs, numpy as np, zarr

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "hazard_zarr_mini")
shutil.rmtree(OUT, ignore_errors=True)
root = zarr.open_group(OUT, mode="w", zarr_format=2)
ATTRS = {"epsg": 32704, "pixel_size_m": 5.0, "units": "m (flood depth)",
         "model_transformation": [5.0, 0, 0, 413152.5, 0, 5.0, 0, 7646506.5, 0, 0, 0, 0, 0, 0, 0, 1.0]}
zstd = numcodecs.Zstd(level=3)

def coord(group, name, values, dims):
    group.create_array(name, data=np.asarray(values), chunks=(len(values),), compressors=zstd, fill_value=None,
                       attributes={"_ARRAY_DIMENSIONS": dims})

def depth(group, shape, chunks, dims, fn):
    arr = group.create_array("depth", shape=shape, chunks=chunks, dtype="float32", fill_value=float("nan"),
                             compressors=zstd, attributes={"_ARRAY_DIMENSIONS": dims})
    data = np.fromfunction(fn, shape, dtype="float64").astype("float32")
    arr[...] = data
    return arr

tc = root.create_group("probabilistic").create_group("tc", attributes=ATTRS)
coord(tc, "return_period", [10, 25, 50, 100], ["return_period"])
coord(tc, "slr", [0.0, 0.5], ["slr"])
coord(tc, "y", list(range(6)), ["y"])
coord(tc, "x", list(range(10)), ["x"])
depth(tc, (4, 2, 6, 10), (2, 1, 3, 5), ["return_period", "slr", "y", "x"],
      lambda r, s, y, x: r * 100 + s * 10 + y + x / 10)

hist = root.create_group("historical_tcs", attributes=ATTRS)
coord(hist, "event", np.array(["01-Mar-1987", "02-Jan-1995", "Évènement-3"], dtype="<U32"), ["event"])
coord(hist, "slr", [0.0, 0.5], ["slr"])
depth(hist, (3, 2, 6, 10), (1, 1, 6, 10), ["event", "slr", "y", "x"],
      lambda e, s, y, x: e * 1000 + s * 10 + y + x / 10)
zarr.consolidate_metadata(OUT, zarr_format=2)

# leave one chunk out, the way the real store has chunks that were never written
os.remove(os.path.join(OUT, "probabilistic", "tc", "depth", "1.1.1.1"))
# the consolidated file records no chunks, so it needs no change
print("wrote", OUT, sum(len(f) for _, _, f in os.walk(OUT)), "files")
