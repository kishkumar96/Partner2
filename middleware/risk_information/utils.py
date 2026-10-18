import csv
import io
import json
import logging
import os
from typing import Any


SUPPORTED_EXTENSIONS = {"geojson", "csv", "gpkg"}

logger = logging.getLogger(__name__)


def convert_uploaded_file_to_geometry(
    *,
    file_obj,
    filename: str,
    file_path: str | None = None,
) -> Any | None:
    """Convert an uploaded file to a JSON-serializable geometry payload.

    - geojson: parsed JSON dict
    - csv: list[dict] rows
    - gpkg: GeoJSON dict (requires geopandas + GDAL)
    """

    _, ext = os.path.splitext(filename or "")
    ext = ext.lstrip(".").lower()

    if ext not in SUPPORTED_EXTENSIONS:
        return None

    if ext == "geojson":
        raw = file_obj.read()
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        return json.loads(raw)

    if ext == "csv":
        if hasattr(file_obj, "seek"):
            try:
                file_obj.seek(0)
            except Exception:
                pass
        text_stream = io.TextIOWrapper(file_obj, encoding="utf-8-sig", newline="")
        reader = csv.DictReader(text_stream)
        return [row for row in reader]

    # gpkg
    try:
        path = file_path or getattr(file_obj, "name", None)
        if not path:
            return None
        if hasattr(file_obj, "close"):
            try:
                file_obj.close()
            except Exception:
                pass

        # Prefer pyogrio when available (often most reliable for GPKG).
        try:
            import pyogrio  # type: ignore

            layer_name = None
            try:
                layers_info = pyogrio.list_layers(path)
                if layers_info is not None and len(layers_info) > 0:
                    # layers_info is a DataFrame-like structure
                    layer_name = str(layers_info.iloc[0]["name"])
            except Exception:
                layer_name = None

            try:
                gdf = pyogrio.read_dataframe(path, layer=layer_name) if layer_name else pyogrio.read_dataframe(path)
                return json.loads(gdf.to_json())
            except Exception:
                pass
        except Exception:
            pass

        # Fall back to geopandas (requires either fiona or pyogrio backend + GDAL).
        try:
            import geopandas as gpd  # type: ignore
        except Exception:
            return None

        # First attempt: default engine.
        try:
            gdf = gpd.read_file(path)
            return json.loads(gdf.to_json())
        except Exception:
            pass

        # Second attempt: explicitly read first layer when fiona is present.
        try:
            import fiona  # type: ignore

            layers = list(fiona.listlayers(path))
            if not layers:
                return None
            gdf = gpd.read_file(path, layer=layers[0])
            return json.loads(gdf.to_json())
        except Exception:
            logger.exception("Failed to convert gpkg to geojson for %s (path=%s)", filename, path)
            return None
    except Exception:
        logger.exception("Failed to convert gpkg to geojson for %s", filename)
        return None
