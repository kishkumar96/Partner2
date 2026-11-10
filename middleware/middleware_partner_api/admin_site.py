from __future__ import annotations

from typing import Any

from django.contrib import admin
from django.contrib.admin import AdminSite


class PartnerAdminSite(AdminSite):
    site_header = "Pacific Disaster API"
    site_title = "Pacific Disaster API"
    index_title = "Pacific Disaster API"

    def get_app_list(self, request, app_label=None):
        app_list = super().get_app_list(request, app_label=app_label)

        if app_label is not None:
            return app_list

        # NOTE: hazard_type uses label="event_type" for migration continuity,
        # so we merge app_label "event_type" under Hazards.
        # Order matters because our merge implementation prepends the merged section.
        merges = [
            ("Risks", {"risk_category", "risk_information"}),
            ("Hazards", {"hazard_information", "event_type"}),
            ("Event", {"event", "event_type_v2"}),
            ("Cyclone", {"cyclone_track", "cyclone_track_type"}),
            ("Country", {"country", "island", "region"}),
        ]

        remaining = list(app_list)

        def _merge_section(display_name: str, labels: set[str]) -> None:
            nonlocal remaining
            merged_models: list[dict[str, Any]] = []
            merged_app: dict[str, Any] | None = None
            new_remaining: list[dict[str, Any]] = []

            for app in remaining:
                if app.get("app_label") in labels:
                    if merged_app is None:
                        merged_app = dict(app)
                    merged_models.extend(app.get("models", []))
                else:
                    new_remaining.append(app)

            if merged_app is None:
                remaining = new_remaining
                return

            merged_app["name"] = display_name
            merged_app["models"] = sorted(
                merged_models, key=lambda m: (m.get("name") or "").lower()
            )
            merged_app["app_url"] = ""

            remaining = [merged_app] + new_remaining

        for display_name, labels in merges:
            _merge_section(display_name, labels)

        # Sort model links A→Z inside each section.
        for app in remaining:
            app["models"] = sorted(
                app.get("models", []),
                key=lambda m: (m.get("name") or "").lower(),
            )

        return remaining


partner_admin_site = PartnerAdminSite(name="partner_admin")

# Autodiscover admin modules (they register with django.contrib.admin.site by default)
# then mirror that registry into our custom site.
admin.autodiscover()
for model, model_admin in admin.site._registry.items():
    partner_admin_site.register(model, model_admin.__class__)
