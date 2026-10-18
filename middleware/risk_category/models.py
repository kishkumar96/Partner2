from django.db import models


class RiskCategory(models.Model):
    short_name = models.CharField(max_length=255)
    long_name = models.CharField(max_length=255)

    def __str__(self) -> str:
        return self.short_name
