from django.contrib import admin

from .models import CitizenScience, CitizenScienceMedia


class CitizenScienceMediaInline(admin.TabularInline):
    model = CitizenScienceMedia
    extra = 0


@admin.register(CitizenScience)
class CitizenScienceAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "captured_by", "country", "region", "island")
    list_select_related = ("country", "region", "island")
    search_fields = (
        "title",
        "captured_by",
        "description",
        "country__short_name",
        "country__long_name",
        "region__region_name",
        "island__island_name",
    )
    inlines = (CitizenScienceMediaInline,)


@admin.register(CitizenScienceMedia)
class CitizenScienceMediaAdmin(admin.ModelAdmin):
    list_display = ("id", "citizen_science", "file")
    list_select_related = ("citizen_science",)
