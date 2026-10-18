from django.core.validators import FileExtensionValidator
from django.db import models


class CitizenScience(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    captured_by = models.CharField(max_length=255, null=True, blank=True)

    lat = models.FloatField(null=True, blank=True)
    lon = models.FloatField(null=True, blank=True)

    island = models.ForeignKey(
        "island.Island",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="citizen_science",
    )

    region = models.ForeignKey(
        "region.Region",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="citizen_science",
    )

    country = models.ForeignKey(
        "country.Country",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="citizen_science",
    )

    def __str__(self) -> str:
        parts: list[str] = [self.title]
        if self.captured_by:
            parts.append(self.captured_by)
        if self.country_id and self.country:
            parts.append(self.country.short_name or self.country.long_name)
        elif self.region_id and self.region:
            parts.append(self.region.region_name)
        elif self.island_id and self.island:
            parts.append(self.island.island_name)
        return " | ".join(parts)


class CitizenScienceMedia(models.Model):
    citizen_science = models.ForeignKey(
        CitizenScience,
        on_delete=models.CASCADE,
        related_name="media",
    )

    file = models.FileField(
        upload_to="citizen_science/",
        validators=[
            FileExtensionValidator(
                allowed_extensions=[
                    # images
                    "jpg",
                    "jpeg",
                    "png",
                    "gif",
                    "webp",
                    # videos
                    "mp4",
                    "mov",
                    "avi",
                    "mkv",
                    "webm",
                ]
            )
        ],
    )

    def __str__(self) -> str:
        return f"CitizenScienceMedia {self.pk}"
