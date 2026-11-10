from django.db import models


class CycloneTrackType(models.Model):
    name = models.CharField(max_length=255)

    class Meta:
        db_table = "cyclone_track_type"

    def __str__(self) -> str:
        return self.name

