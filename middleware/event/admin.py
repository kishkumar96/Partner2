from django.contrib import admin
from django.urls import reverse
from django.utils.html import format_html, format_html_join

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
    readonly_fields = ("advisory_runs",)
    autocomplete_fields = (
        "event_type",
        "country",
        "cyclone_track",
        "hazards",
        "risks",
        "citizen_sciences",
        "model_run",
    )

    @admin.display(description="Advisory runs of this storm")
    def advisory_runs(self, obj):
        """Every forecast run of the Event's storm, newest first.

        The Event links only the run it shows (Model run, above); the other advisories are tied to it
        by their track's storm name and country, so this is where they are listed.
        """
        # Imported here: the model app imports Event, so a module-level import would be circular
        from model.queueing import forecast_runs_for_event

        runs = forecast_runs_for_event(obj) if obj.pk else []
        if not runs:
            return "None (not a forecast Event, or its runs were loaded by hand)"
        rows = format_html_join(
            "",
            "<tr><td><a href=\"{}\">Run {}</a></td><td>{}</td><td>{}</td><td>{}</td><td>{} outputs</td><td>{}</td></tr>",
            (
                (
                    reverse("partner_admin:model_modelrun_change", args=[run["id"]]),
                    run["id"],
                    run["issued_time"].strftime("%Y-%m-%d %H:%M UTC") if run["issued_time"] else "no time",
                    run["cyclone_name"],
                    run["status"],
                    len(run["risks"]),
                    "shown on this Event" if run["is_current"] else "",
                )
                for run in runs
            ),
        )
        return format_html("<table>{}</table>", rows)
