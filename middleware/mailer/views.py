from django.shortcuts import get_object_or_404
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import MailConfiguration, MailRecipient
from .serializers import (
    MailConfigurationSendSerializer,
    MailConfigurationSerializer,
    MailRecipientSerializer,
)
from .utils import SPCMailer


class MailRecipientListCreateView(ListCreateAPIView):
    queryset = MailRecipient.objects.all().order_by("email")
    serializer_class = MailRecipientSerializer
    permission_classes = (IsAdminUser,)


class MailRecipientDetailView(RetrieveUpdateDestroyAPIView):
    queryset = MailRecipient.objects.all()
    serializer_class = MailRecipientSerializer
    permission_classes = (IsAdminUser,)


class MailConfigurationListCreateView(ListCreateAPIView):
    queryset = MailConfiguration.objects.all().prefetch_related("recipients").order_by("name")
    serializer_class = MailConfigurationSerializer
    permission_classes = (IsAdminUser,)


class MailConfigurationDetailView(RetrieveUpdateDestroyAPIView):
    queryset = MailConfiguration.objects.all().prefetch_related("recipients")
    serializer_class = MailConfigurationSerializer
    permission_classes = (IsAdminUser,)


class MailConfigurationSendView(APIView):
    permission_classes = (IsAdminUser,)

    def post(self, request, pk: int):
        config = get_object_or_404(MailConfiguration, pk=pk)
        serializer = MailConfigurationSendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payload = serializer.validated_data
        result = SPCMailer.send_with_config_sync(
            config,
            subject=payload.get("subject"),
            body=payload.get("body"),
            to_emails=payload.get("to"),
        )

        if not result.ok:
            return Response(
                {
                    "ok": False,
                    "status_code": result.status_code,
                    "response_text": result.response_text,
                },
                status=502,
            )

        return Response({"ok": True})
