from django.http import JsonResponse
from django.shortcuts import render
from .services import landing_context
from .calendar_services import get_calendar_events_for_user


def landing(request):
    return render(request, "landing/index.html", landing_context())


def calendar_events_api(request):
    role = request.GET.get("role", "admin")
    user = request.user if request.user.is_authenticated else None
    events = get_calendar_events_for_user(user, role=role)
    return JsonResponse({"ok": True, "events": events})
