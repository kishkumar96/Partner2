from datetime import timedelta

from django.contrib import admin
from django.db.models import Count
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html

from event.models import Event

from .models import (
    Model,
    ModelDomain,
    ModelLogs,
    ModelPriority,
    ModelRun,
    ModelStatus,
    ModelTrigger,
    RunnerHeartbeat,
)
from .queueing import _event_for_storm, _results_country_id


@admin.register(ModelDomain)
class ModelDomainAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)


@admin.register(ModelPriority)
class ModelPriorityAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)


@admin.register(ModelStatus)
class ModelStatusAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)


@admin.register(Model)
class ModelAdmin(admin.ModelAdmin):
    list_display = ("name", "server_name", "next_model", "runner_readiness", "location")
    search_fields = ("name", "server_name", "location")

    @admin.display(description="Runner")
    def runner_readiness(self, obj):
        heartbeat = RunnerHeartbeat.objects.filter(server_name=obj.server_name).first()
        if not heartbeat or heartbeat.last_seen_at < timezone.now() - timedelta(minutes=2):
            return "Offline — no heartbeat in 2 min"
        return f"Online ({heartbeat.hostname or heartbeat.backend})"


@admin.register(ModelRun)
class ModelRunAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "status",
        "tc_track",
        "event_link",
        "outputs",
        "attempts",
        "claimed_by",
        "created_at",
        "finished_at",
        "failure_summary",
    )
    list_filter = ("status", "model_domain", "priority")
    search_fields = ("name", "models__name")
    list_select_related = ("model_domain", "tc_track", "priority")
    filter_horizontal = ("models",)
    readonly_fields = ("claimed_by", "claimed_at", "finished_at", "attempts", "event_link")
    actions = ("requeue",)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(output_count=Count("risk_information", distinct=True))

    @admin.display(description="Outputs", ordering="output_count")
    def outputs(self, obj):
        return obj.output_count

    @admin.display(description="Event")
    def event_link(self, obj):
        """The Event this run belongs to. An Event links only the run it shows, so the others are found by storm."""
        if obj.pk is None:
            return "—"
        event = Event.objects.filter(model_run=obj).first()
        shown = event is not None
        if event is None:
            event = _event_for_storm(obj.tc_track, _results_country_id(obj) or obj.tc_track.country_id)
        if event is None:
            return "—"
        url = reverse("partner_admin:event_event_change", args=[event.pk])
        return format_html(
            '<a href="{}">Event {}</a> ({})', url, event.pk, "the one it shows" if shown else "another run of this storm"
        )

    @admin.display(description="Failure")
    def failure_summary(self, obj):
        return obj.error[:120] if obj.error else "—"

    @admin.action(description="Requeue selected runs")
    def requeue(self, request, queryset):
        count = queryset.update(
            status=ModelRun.QUEUED,
            model_run_completed=False,
            attempts=0,
            claimed_by="",
            claimed_at=None,
            finished_at=None,
            error="",
            created_at=timezone.now(),
        )
        self.message_user(request, f"Requeued {count} run(s).")


@admin.register(ModelTrigger)
class ModelTriggerAdmin(admin.ModelAdmin):
    list_display = ("cyclone_track_type", "country", "model", "model_domain", "priority", "enabled")
    list_filter = ("enabled", "cyclone_track_type", "country")
    list_select_related = ("cyclone_track_type", "country", "model", "model_domain", "priority")


@admin.register(ModelLogs)
class ModelLogsAdmin(admin.ModelAdmin):
    list_display = ("id", "model_run", "status")
    search_fields = ("model_run__name", "model_run__id")
    list_select_related = ("model_run", "status")


@admin.register(RunnerHeartbeat)
class RunnerHeartbeatAdmin(admin.ModelAdmin):
    list_display = ("server_name", "backend", "hostname", "last_seen_at", "is_online")
    search_fields = ("server_name", "hostname")
    readonly_fields = ("last_seen_at",)

    @admin.display(boolean=True, description="Online")
    def is_online(self, obj):
        return obj.last_seen_at >= timezone.now() - timedelta(minutes=2)

