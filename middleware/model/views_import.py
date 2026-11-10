import tempfile
from pathlib import Path
from urllib.parse import urlparse

from django.conf import settings
from django.db import transaction
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from country.lookup import find_country

from . import ingest_service as svc

# What an import writes: the run, its outputs, and a track when the advisory has none yet
IMPORT_PERMISSIONS = (
    "model.add_modelrun",
    "risk_information.add_riskinformation",
    "cyclone_track.add_cyclonetrack",
)
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
DEFAULT_TRACK_HOSTS = ["pacific-disaster-api.spc.int"]


class CanImportRuns(BasePermission):
    """A user who may add runs, outputs and tracks, so a runner's account can be limited to just that."""

    message = "This account may not import runs."

    def has_permission(self, request, view):
        return bool(request.user and request.user.has_perms(IMPORT_PERMISSIONS))


class ImportRunSerializer(serializers.Serializer):
    country = serializers.CharField(help_text="Country code, e.g. CK.")
    track_url = serializers.URLField(help_text="The SPC cyclone track the run was given.")
    outputs = serializers.FileField(help_text="A zip of the run's outputs.")
    riskscape_run = serializers.URLField(required=False, allow_blank=True, default="")
    storm = serializers.CharField(required=False, allow_blank=True, default="")
    replace = serializers.BooleanField(required=False, default=False)

    def validate_outputs(self, value):
        if value.size > MAX_UPLOAD_BYTES:
            raise serializers.ValidationError("The zip is too large.")
        return value

    def validate_riskscape_run(self, value):
        # Stored on the run and served by the public API: a share link is a credential for the run
        if "/shared/" in urlparse(value).path or "guest" in value.lower():
            raise serializers.ValidationError("Send the run's address, not a share (guest) link.")
        return value


def accepted_track_hosts(request):
    hosts = list(getattr(settings, "INGEST_TRACK_HOSTS", None) or DEFAULT_TRACK_HOSTS)
    # Tracks on this server's own API are fine too
    hosts.append(request.get_host().split(":")[0])
    return hosts


class ModelRunImportView(APIView):
    """POST a finished run's outputs (a zip) with the SPC track it was given.

    The advisory becomes a run of the storm's Event, exactly as `ingest_riskscape_run` does. Sending
    the same run again is harmless (200, nothing changes) unless `replace` is true.
    """

    parser_classes = (MultiPartParser, FormParser)
    permission_classes = (CanImportRuns,)

    def post(self, request):
        body = ImportRunSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        country = find_country(data["country"])
        if country is None:
            return Response({"detail": f"No country matching '{data['country']}'."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with tempfile.TemporaryDirectory() as folder:
                folder = Path(folder)
                svc.unpack_outputs(data["outputs"], folder)
                track_data, csv_bytes = svc.fetch_track(data["track_url"], accepted_track_hosts(request))
                advisory = svc.resolve_advisory(track_data, csv_bytes, data["storm"] or None)
                # One transaction, so a run that fails halfway leaves no track behind
                with transaction.atomic():
                    track = svc.find_track(advisory, country)
                    existing = svc.imported_run(track)
                    if existing and not data["replace"]:
                        return Response(
                            {
                                "detail": "Already imported; send replace=true to import it again.",
                                "already_imported": True,
                                "run": existing.pk,
                                "track": track.pk,
                                "advisory": advisory.name,
                            }
                        )
                    track = track or svc.create_track(advisory, country, track_data, csv_bytes, folder)
                    event, run, skipped = svc.import_folder(
                        folder,
                        country,
                        track,
                        advisory,
                        replace=data["replace"],
                        external_url=data["riskscape_run"],
                    )
        except svc.IngestError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "advisory": advisory.name,
                "event": event.pk,
                "run": run.pk,
                "track": track.pk,
                "outputs": run.risk_information.count(),
                "skipped": skipped,
                "shown": event.model_run_id == run.pk,
            },
            status=status.HTTP_201_CREATED,
        )
