"""API endpoint to apply parsed scholarship records directly to student database profiles."""

from __future__ import annotations

import json
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST

from backend.accounts.services import require_portal_access
from backend.student.models import StudentEnrollmentProfile, StudentRegistration
from .pending_enrollment import _profile_for_registration
from .services import REGISTRAR_ROLE


@login_required(login_url="/")
@require_POST
def scholarship_integrate_records(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return JsonResponse({"ok": False, "message": "Access denied."}, status=403)

    try:
        body = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "message": "Invalid JSON payload."}, status=400)

    scholars = body.get("scholars", [])
    sponsor = (body.get("sponsor") or "").strip()

    if not isinstance(scholars, list) or not scholars:
        return JsonResponse({"ok": False, "message": "No scholars provided for integration."}, status=400)

    updated_count = 0
    updated_records = []

    for item in scholars:
        registration_id = item.get("registrationId")
        profile_id = item.get("profileId")
        scholarship_type = item.get("scholarshipType") or "tesda"

        reg = None
        if registration_id:
            reg = StudentRegistration.objects.filter(
                pk=registration_id,
                status=StudentRegistration.Status.APPROVED,
            ).first()

        profile = None
        if profile_id:
            profile = StudentEnrollmentProfile.objects.filter(pk=profile_id).first()
        elif reg:
            profile = _profile_for_registration(reg)

        if profile:
            profile.scholarship_type = scholarship_type
            profile.save(update_fields=["scholarship_type"])
            updated_count += 1
            updated_records.append(str(profile.pk))
        elif reg:
            # Create base enrollment profile for approved student if not existing
            profile = StudentEnrollmentProfile.objects.create(
                user=reg.user,
                registration=reg,
                entry_date=reg.created_at.date() if reg.created_at else None,
                first_name=reg.first_name,
                last_name=reg.last_name,
                middle_name=reg.middle_name,
                email=reg.email,
                contact_number=reg.phone_number,
                sex=reg.gender,
                civil_status=reg.civil_status,
                birth_date=reg.birth_date,
                selected_program=reg.selected_program,
                program_type=reg.program_type,
                scholarship_type=scholarship_type,
                profile_step_completed=True,
            )
            updated_count += 1
            updated_records.append(str(profile.pk))

    return JsonResponse({
        "ok": True,
        "updatedCount": updated_count,
        "message": f"Successfully integrated {updated_count} scholar record(s) into database.",
    })
