from rest_framework.generics import ListCreateAPIView, RetrieveAPIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticatedOrReadOnly

from django.db.models import Prefetch

from hazard_information.models import HazardInformation
from risk_information.models import RiskInformation

from .models import Event
from .serializers import EventSerializer


def event_queryset():
    """Events with what the serializer reads, and nothing more.

    An event lists its risks and hazards by id only. Prefetching the full rows decoded their
    geometry (megabytes of JSON each) for nothing: about 2 of the 3 seconds the list took.
    """
    return (
        Event.objects.all()
        .select_related("event_type", "country", "cyclone_track", "model_run")
        .defer("cyclone_track__geometry")
        .prefetch_related(
            Prefetch("risks", queryset=RiskInformation.objects.only("id")),
            Prefetch("hazards", queryset=HazardInformation.objects.only("id")),
            "citizen_sciences",
        )
    )


class EventPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 200


class EventListCreateView(ListCreateAPIView):
    queryset = event_queryset().order_by("-id")
    serializer_class = EventSerializer
    pagination_class = EventPagination

    # GET is public, POST requires auth
    permission_classes = (IsAuthenticatedOrReadOnly,)


class EventRetrieveView(RetrieveAPIView):
    queryset = event_queryset()
    serializer_class = EventSerializer

    # GET is public (same as list)
    permission_classes = (IsAuthenticatedOrReadOnly,)
