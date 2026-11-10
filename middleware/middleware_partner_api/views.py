from django.http import JsonResponse
from django.shortcuts import redirect

def root(request):
    return redirect("/partner_api/")

def partner_api_root(request):
    return JsonResponse({"message": "Welcome to Pacific Disaster api"})
