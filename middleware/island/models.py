from django.db import models


class Island(models.Model):
    country = models.ForeignKey(
        "country.Country",
        on_delete=models.CASCADE,
        related_name="islands",
        null=True,
        blank=True,
    )
    island_name = models.CharField(max_length=255)

    region = models.ForeignKey(
        "region.Region",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="islands",
    )

    def __str__(self) -> str:
        return self.island_name
