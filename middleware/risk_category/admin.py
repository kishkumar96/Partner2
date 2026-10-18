from django.contrib import admin

from .models import RiskCategory


@admin.register(RiskCategory)
class RiskCategoryAdmin(admin.ModelAdmin):
    list_display = ("short_name", "long_name")
