from rest_framework import serializers

from .models import CycloneTrack


class CycloneTrackSerializer(serializers.ModelSerializer):
    class Meta:
        model = CycloneTrack
        fields = (
            "id",
            "cyclone_name",
            "issued_time",
            "issued_agency",
            "cyclone_track_type",
            "track_file",
            "geometry",
            "geometry_computed",
            "country",
            "notify",
            "mail_configuration",
        )
        read_only_fields = ("id", "geometry", "geometry_computed")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        notify = attrs.get("notify")
        mail_configuration = attrs.get("mail_configuration")

        if notify and not mail_configuration:
            raise serializers.ValidationError(
                {"mail_configuration": "Required when notify=true."}
            )

        return attrs
