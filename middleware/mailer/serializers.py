from rest_framework import serializers

from .models import MailConfiguration, MailRecipient


class MailRecipientSerializer(serializers.ModelSerializer):
    class Meta:
        model = MailRecipient
        fields = ("id", "name", "email", "is_active", "created_at")
        read_only_fields = ("id", "created_at")


class MailConfigurationSerializer(serializers.ModelSerializer):
    recipients = serializers.PrimaryKeyRelatedField(
        many=True, required=False, queryset=MailRecipient.objects.all()
    )

    class Meta:
        model = MailConfiguration
        fields = (
            "id",
            "name",
            "is_active",
            "client_id",
            "authority_url",
            "client_secret_value",
            "email_sender",
            "email_sender_name",
            "subject",
            "body",
            "recipients",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        extra_kwargs = {
            "client_secret_value": {"write_only": True},
        }


class MailConfigurationSendSerializer(serializers.Serializer):
    subject = serializers.CharField(required=False, allow_blank=False, max_length=255)
    body = serializers.CharField(required=False, allow_blank=False)
    to = serializers.ListField(
        child=serializers.EmailField(),
        required=False,
        help_text="Optional override recipient list. If omitted, uses recipients attached to the configuration.",
    )
