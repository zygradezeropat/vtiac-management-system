from django.shortcuts import render

from .services import landing_context


def landing(request):
    return render(request, "landing/index.html", landing_context())
