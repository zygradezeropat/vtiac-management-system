"""Registrar API — manual E.G.A.C.E employment and certificate milestones."""

from __future__ import annotations

import json

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST

from backend.accounts.services import require_portal_access
from backend.student.models import StudentRegistration

from .services import REGISTRAR_ROLE


def _parse_bool(value) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return None


@login_required(login_url="/")
@require_POST
def egace_set_employment(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return JsonResponse({"ok": False, "message": "Access denied."}, status=403)

    registration_id = (request.POST.get("registration_id") or "").strip()
    employment_raw = request.POST.get("employment")

    if request.content_type and "application/json" in request.content_type:
        try:
            body = json.loads(request.body.decode("utf-8") or "{}")
            registration_id = (body.get("registration_id") or registration_id).strip()
            if "employment" in body:
                employment_raw = body.get("employment")
        except json.JSONDecodeError:
            return JsonResponse({"ok": False, "message": "Invalid JSON."}, status=400)

    if not registration_id:
        return JsonResponse(
            {"ok": False, "message": "registration_id is required."},
            status=400,
        )

    employment = _parse_bool(employment_raw)
    if employment is None:
        return JsonResponse(
            {"ok": False, "message": "employment must be true or false."},
            status=400,
        )

    try:
        reg = StudentRegistration.objects.get(
            pk=registration_id,
            status=StudentRegistration.Status.APPROVED,
        )
    except (StudentRegistration.DoesNotExist, ValueError):
        return JsonResponse(
            {"ok": False, "message": "Enrolled student not found."},
            status=404,
        )

    reg.egace_employment = employment
    reg.save(update_fields=["egace_employment"])

    return JsonResponse(
        {
            "ok": True,
            "registration_id": str(reg.pk),
            "employment": reg.egace_employment,
            "message": "Employment status updated.",
        }
    )


@login_required(login_url="/")
@require_POST
def egace_set_certificate(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return JsonResponse({"ok": False, "message": "Access denied."}, status=403)

    registration_id = (request.POST.get("registration_id") or "").strip()
    certificate_raw = request.POST.get("certificate")

    if request.content_type and "application/json" in request.content_type:
        try:
            body = json.loads(request.body.decode("utf-8") or "{}")
            registration_id = (body.get("registration_id") or registration_id).strip()
            if "certificate" in body:
                certificate_raw = body.get("certificate")
        except json.JSONDecodeError:
            return JsonResponse({"ok": False, "message": "Invalid JSON."}, status=400)

    if not registration_id:
        return JsonResponse(
            {"ok": False, "message": "registration_id is required."},
            status=400,
        )

    certificate = _parse_bool(certificate_raw)
    if certificate is None:
        return JsonResponse(
            {"ok": False, "message": "certificate must be true or false."},
            status=400,
        )

    try:
        reg = StudentRegistration.objects.get(
            pk=registration_id,
            status=StudentRegistration.Status.APPROVED,
        )
    except (StudentRegistration.DoesNotExist, ValueError):
        return JsonResponse(
            {"ok": False, "message": "Enrolled student not found."},
            status=404,
        )

    reg.egace_certificate = certificate
    reg.save(update_fields=["egace_certificate"])

    return JsonResponse(
        {
            "ok": True,
            "registration_id": str(reg.pk),
            "certificate": reg.egace_certificate,
            "message": "Certificate status updated.",
        }
    )
