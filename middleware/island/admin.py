from django.contrib import admin

from .models import Island


@admin.register(Island)
class IslandAdmin(admin.ModelAdmin):
    list_display = ("island_name", "country", "region")
    list_select_related = ("country", "region")
