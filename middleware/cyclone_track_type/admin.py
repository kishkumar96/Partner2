from django.contrib import admin

from .models import CycloneTrackType


@admin.register(CycloneTrackType)
class CycloneTrackTypeAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
    search_fields = ("name",)

