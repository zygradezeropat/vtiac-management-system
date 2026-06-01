"""API for registrar to assign class schedule options to students."""

import json

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from backend.accounts.services import require_portal_access
from backend.student.models import StudentEnrollmentProfile
from backend.student.schedule_assignment import (
    get_schedule_options_for_profile,
    replace_schedule_options,
)

from .services import REGISTRAR_ROLE


def _parse_body(request):
    try:
        return json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


@login_required(login_url="/")
@require_http_methods(["GET", "POST"])
def student_schedule_options(request, profile_id):
    """
    GET — list assigned schedule options for a profile.
    POST — replace options (body: {"options": [...], "assigned_by": "..."}).
    """
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return denied

    try:
        profile = StudentEnrollmentProfile.objects.get(pk=profile_id)
    except StudentEnrollmentProfile.DoesNotExist:
        return JsonResponse({"error": "Profile not found."}, status=404)

    if request.method == "GET":
        return JsonResponse(
            {
                "profile_id": profile.pk,
                "student": f"{profile.first_name} {profile.last_name}",
                "options": get_schedule_options_for_profile(profile),
            }
        )

    payload = _parse_body(request)
    if payload is None:
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    options = payload.get("options")
    if not isinstance(options, list):
        return JsonResponse({"error": '"options" must be a list.'}, status=400)

    assigned_by = payload.get("assigned_by") or request.user.get_full_name() or request.user.email
    try:
        created = replace_schedule_options(profile, options, assigned_by=assigned_by)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse(
        {
            "profile_id": profile.pk,
            "count": len(created),
            "options": get_schedule_options_for_profile(profile),
        }
    )
