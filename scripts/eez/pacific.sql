-- The Pacific islands' EEZ zones out of Marine Regions' World EEZ v12 (low resolution), for the map's
-- visual context layer. Run by prepare.py through ogr2ogr's SQLite dialect (needs GDAL with SpatiaLite).
--
-- Zones that cross the dateline are stored cut in two at +-180. Here the western part is moved east by 360
-- degrees and merged with the eastern part, so Fiji, Tuvalu and the Gilbert Islands are each one polygon
-- (longitudes up to about 184) and the outline has no seam on the dateline. MapLibre draws that correctly.
--
-- ST_CollectionExtract(..., 3) keeps only polygons: clipping leaves stray line fragments behind.
SELECT
  GEONAME AS name,
  ISO_TER1 AS iso,
  TERRITORY1 AS territory,
  SOVEREIGN1 AS sovereign,
  POL_TYPE AS type,
  MRGID_EEZ AS mrgid,
  ST_CollectionExtract(
    ST_SimplifyPreserveTopology(
      CASE
        WHEN ST_MinX(geometry) < -179.99 AND ST_MaxX(geometry) > 179.99
          THEN ST_Union(
            ST_Intersection(geometry, BuildMbr(0, -90, 180, 90)),
            ST_Translate(ST_Intersection(geometry, BuildMbr(-180, -90, 0, 90)), 360, 0, 0)
          )
        ELSE geometry
      END,
      0.04
    ),
    3
  ) AS geometry
FROM eez_v12_lowres
WHERE POL_TYPE <> 'Joint regime'
  AND (
    ISO_TER1 IN ('ASM','COK','PYF','GUM','KIR','MHL','FSM','NRU','NCL','NIU','MNP','PLW','PNG','PCN',
                 'WSM','SLB','TKL','TON','TUV','VUT','WLF','FJI','NFK','UMI')
    OR GEONAME LIKE 'Overlapping claim Matthew and Hunter%'
  )
