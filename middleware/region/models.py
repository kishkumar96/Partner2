from django.db import models


class Region(models.Model):
    region_name = models.CharField(max_length=255)

    def __str__(self) -> str:
        return self.region_name
