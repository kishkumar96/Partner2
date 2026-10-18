from rest_framework import serializers

from .models import CitizenScience, CitizenScienceMedia


class CitizenScienceMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = CitizenScienceMedia
        fields = (
            "id",
            "file",
        )
        read_only_fields = ("id",)


class CitizenScienceSerializer(serializers.ModelSerializer):
    media = CitizenScienceMediaSerializer(many=True, read_only=True)

    class Meta:
        model = CitizenScience
        fields = (
            "id",
            "title",
            "description",
            "captured_by",
            "lat",
            "lon",
            "island",
            "region",
            "country",
            "media",
        )
        read_only_fields = ("id", "media")

    def create(self, validated_data):
        request = self.context.get("request")
        instance = super().create(validated_data)

        if request is None:
            return instance

        # Accept multiple uploads as either repeated `files` fields or repeated `file` fields.
        files = []
        try:
            files.extend(request.FILES.getlist("files"))
        except Exception:
            pass
        try:
            files.extend(request.FILES.getlist("file"))
        except Exception:
            pass

        for f in files:
            CitizenScienceMedia.objects.create(citizen_science=instance, file=f)

        return instance
