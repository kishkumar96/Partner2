from rest_framework import serializers
from .models import Country

from island.models import Island
from region.models import Region


class IslandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Island
        fields = ("id", "island_name", "region")


class RegionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Region
        fields = ("id", "region_name")

class CountrySerializer(serializers.ModelSerializer):
    islands = IslandSerializer(many=True, read_only=True, required=False)
    regions = RegionSerializer(many=True, read_only=True)

    class Meta:
        model = Country
        fields = '__all__'
