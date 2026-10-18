from rest_framework.generics import ListCreateAPIView
from .models import ModelLogs
from .serializers import ModelLogsSerializer

class ModelLogsListCreateView(ListCreateAPIView):
    queryset = ModelLogs.objects.all().order_by('-id')
    serializer_class = ModelLogsSerializer
