from django.contrib import admin

from .models import Event


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "event_datetime",
        "event_type",
        "country",
        "cyclone_track",
        "model_run",
    )
    list_select_related = ("event_type", "country", "cyclone_track", "model_run")
    autocomplete_fields = (
        "event_type",
        "country",
        "cyclone_track",
        "hazards",
        "risks",
        "citizen_sciences",
        "model_run",
    )
