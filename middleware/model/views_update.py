from rest_framework.generics import UpdateAPIView
from .models import ModelRun
from .serializers import ModelRunSerializer

class ModelRunUpdateCompletedView(UpdateAPIView):
    queryset = ModelRun.objects.all()
    serializer_class = ModelRunSerializer
    http_method_names = ['patch']

    def get_object(self):
        return super().get_object()
