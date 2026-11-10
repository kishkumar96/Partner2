from django.db import models


class EventType(models.Model):
    event_name = models.CharField(max_length=255)

    class Meta:
        db_table = "event_type"

    def __str__(self) -> str:
        return self.event_name
