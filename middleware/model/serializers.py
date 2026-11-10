
from rest_framework import serializers
from .models import ModelRun, ModelLogs

class ModelRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModelRun
        fields = '__all__'

class ModelLogsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModelLogs
        fields = '__all__'
