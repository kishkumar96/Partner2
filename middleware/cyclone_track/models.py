from django.db import models

from .utils import cyclone_csv_to_geojson


class CycloneTrack(models.Model):
    cyclone_name = models.CharField(max_length=255, null=True, blank=True)
    issued_time = models.DateTimeField(null=True, blank=True)
    issued_agency = models.CharField(max_length=255, null=True, blank=True)

    cyclone_track_type = models.ForeignKey(
        "cyclone_track_type.CycloneTrackType",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="cyclone_tracks",
    )

    # Only mandatory field
    track_file = models.FileField(upload_to="cyclone_tracks/")

    geometry = models.JSONField(null=True, blank=True)

    geometry_computed = models.BooleanField(default=False)

    country = models.ForeignKey(
        'country.Country',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='cyclone_tracks',
    )

    notify = models.BooleanField(default=False)
    mail_configuration = models.ForeignKey(
        "mailer.MailConfiguration",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="cyclone_tracks",
    )

    def __str__(self) -> str:
        name = self.cyclone_name or f"CycloneTrack {self.pk}"
        parts: list[str] = [name]

        if self.issued_time:
            try:
                parts.append(self.issued_time.strftime("%Y-%m-%d"))
            except Exception:
                pass
        if self.issued_agency:
            parts.append(self.issued_agency)
        if self.country_id and self.country:
            parts.append(self.country.short_name or self.country.long_name)

        return " | ".join(parts)

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        old_track_name = None
        if not is_new:
            old_track_name = (
                CycloneTrack.objects.filter(pk=self.pk)
                .values_list("track_file", flat=True)
                .first()
            )

        super().save(*args, **kwargs)

        file_changed = (
            self.track_file
            and old_track_name is not None
            and str(old_track_name) != str(self.track_file.name)
        )

        should_generate = bool(self.track_file) and (self.geometry is None or is_new or file_changed)
        if not should_generate:
            return

        try:
            with self.track_file.open("rb") as file_obj:
                geojson = cyclone_csv_to_geojson(file_obj)
        except Exception:
            CycloneTrack.objects.filter(pk=self.pk).update(
                geometry=None,
                geometry_computed=False,
            )
            return

        def is_blank_geometry(value) -> bool:
            if value is None:
                return True
            if isinstance(value, list):
                return len(value) == 0
            if isinstance(value, dict):
                if len(value) == 0:
                    return True
                features = value.get("features")
                if isinstance(features, list) and len(features) == 0:
                    return True
            return False

        if is_blank_geometry(geojson):
            CycloneTrack.objects.filter(pk=self.pk).update(
                geometry=None,
                geometry_computed=False,
            )
            return

        # If cyclone_name not provided, infer from CSV metadata.
        cyclone_name = self.cyclone_name
        try:
            cyclone_name = cyclone_name or geojson.get("metadata", {}).get("CycloneName")
        except Exception:
            pass

        CycloneTrack.objects.filter(pk=self.pk).update(
            geometry=geojson,
            cyclone_name=cyclone_name,
            geometry_computed=True,
        )
