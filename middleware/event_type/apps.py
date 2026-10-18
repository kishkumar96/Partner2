from django.apps import AppConfig


class EventTypeConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "event_type"

    # hazard_type app already uses label="event_type" for migration continuity,
    # so this app must use a distinct label to avoid conflicts.
    label = "event_type_v2"
    verbose_name = "Event Type"
