from django.contrib import admin

from .models import Region


@admin.register(Region)
class RegionAdmin(admin.ModelAdmin):
    list_display = ("id", "region_name")
    search_fields = ("region_name",)
