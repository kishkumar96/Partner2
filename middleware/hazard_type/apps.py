from django.apps import AppConfig


class HazardTypeConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "hazard_type"

    # Keep the old app label so existing applied migrations (event_type/0001,0002)
    # remain recognized in django_migrations.
    label = "event_type"

    verbose_name = "Hazard Type"
