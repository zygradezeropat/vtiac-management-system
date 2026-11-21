"""Registrar API — manual E.G.A.C.E employment and certificate milestones."""

from __future__ import annotations

import json
import uuid

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST

from backend.accounts.services import require_portal_access
from backend.registrar.models import RegistrarScheduleTemplate
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


def _find_registration(registration_id: str) -> StudentRegistration | None:
    """Lookup registration by UUID PK, integer PK, or reference ID (across any status)."""
    rid = (registration_id or "").strip()
    if not rid:
        return None

    # Try UUID primary key
    try:
        val = uuid.UUID(rid)
        reg = StudentRegistration.objects.filter(pk=val).first()
        if reg:
            return reg
    except (ValueError, AttributeError):
        pass

    # Try reference_id
    reg = StudentRegistration.objects.filter(reference_id__iexact=rid).first()
    if reg:
        return reg

    # Try integer primary key
    if rid.isdigit():
        try:
            reg = StudentRegistration.objects.filter(pk=int(rid)).first()
            if reg:
                return reg
        except Exception:
            pass

    return None


def _update_template_snapshot_candidate(
    identifier: str, field: str, value: bool
) -> bool:
    """Update milestone in national assessment template snapshots."""
    ident = (identifier or "").strip().lower()
    if not ident:
        return False

    updated_any = False
    templates = RegistrarScheduleTemplate.objects.filter(
        batch_kind=RegistrarScheduleTemplate.BatchKind.NATIONAL_ASSESSMENT
    )
    for t in templates:
        snapshot = list(t.students_snapshot or [])
        changed = False
        for s in snapshot:
            if not isinstance(s, dict):
                continue
            sid = str(
                s.get("registrationId")
                or s.get("registration_id")
                or s.get("id")
                or s.get("student_id")
                or ""
            ).strip().lower()
            ref = str(s.get("referenceId") or s.get("reference_id") or "").strip().lower()
            full_name = (
                s.get("fullName") or s.get("name") or s.get("studentName") or ""
            ).strip().lower()

            if (
                sid == ident
                or ref == ident
                or (ident.startswith("assessment-") and str(t.pk) in ident)
                or (ident in full_name and len(ident) > 3)
            ):
                s[field] = value
                changed = True

        if changed:
            t.students_snapshot = snapshot
            t.save(update_fields=["students_snapshot", "updated_at"])
            updated_any = True

    return updated_any


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

    reg = _find_registration(registration_id)
    if reg:
        reg.egace_employment = employment
        reg.save(update_fields=["egace_employment"])
        _update_template_snapshot_candidate(str(reg.pk), "employment", employment)
        if reg.reference_id:
            _update_template_snapshot_candidate(reg.reference_id, "employment", employment)

        return JsonResponse(
            {
                "ok": True,
                "registration_id": str(reg.pk),
                "employment": reg.egace_employment,
                "message": "Employment status updated.",
            }
        )

    snapshot_updated = _update_template_snapshot_candidate(
        registration_id, "employment", employment
    )
    if snapshot_updated:
        return JsonResponse(
            {
                "ok": True,
                "registration_id": registration_id,
                "employment": employment,
                "message": "Employment status updated.",
            }
        )

    return JsonResponse(
        {"ok": False, "message": "Student record not found."},
        status=404,
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

    reg = _find_registration(registration_id)
    if reg:
        reg.egace_certificate = certificate
        reg.save(update_fields=["egace_certificate"])
        _update_template_snapshot_candidate(str(reg.pk), "certificate", certificate)
        if reg.reference_id:
            _update_template_snapshot_candidate(reg.reference_id, "certificate", certificate)

        return JsonResponse(
            {
                "ok": True,
                "registration_id": str(reg.pk),
                "certificate": reg.egace_certificate,
                "message": "Certificate status updated.",
            }
        )

    snapshot_updated = _update_template_snapshot_candidate(
        registration_id, "certificate", certificate
    )
    if snapshot_updated:
        return JsonResponse(
            {
                "ok": True,
                "registration_id": registration_id,
                "certificate": certificate,
                "message": "Certificate status updated.",
            }
        )

    return JsonResponse(
        {"ok": False, "message": "Student record not found."},
        status=404,
    )


@login_required(login_url="/")
@require_POST
def egace_set_graduate(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return JsonResponse({"ok": False, "message": "Access denied."}, status=403)

    registration_id = (request.POST.get("registration_id") or "").strip()
    graduate_raw = request.POST.get("graduate")

    if request.content_type and "application/json" in request.content_type:
        try:
            body = json.loads(request.body.decode("utf-8") or "{}")
            registration_id = (body.get("registration_id") or registration_id).strip()
            if "graduate" in body:
                graduate_raw = body.get("graduate")
        except json.JSONDecodeError:
            return JsonResponse({"ok": False, "message": "Invalid JSON."}, status=400)

    if not registration_id:
        return JsonResponse(
            {"ok": False, "message": "registration_id is required."},
            status=400,
        )

    graduate = _parse_bool(graduate_raw)
    if graduate is None:
        return JsonResponse(
            {"ok": False, "message": "graduate must be true or false."},
            status=400,
        )

    reg = _find_registration(registration_id)
    if reg:
        reg.is_graduated = graduate
        if graduate and not reg.graduated_at:
            from django.utils import timezone

            reg.graduated_at = timezone.now()
        elif not graduate:
            reg.graduated_at = None
        reg.save(update_fields=["is_graduated", "graduated_at"])
        _update_template_snapshot_candidate(str(reg.pk), "graduate", graduate)
        if reg.reference_id:
            _update_template_snapshot_candidate(reg.reference_id, "graduate", graduate)

        return JsonResponse(
            {
                "ok": True,
                "registration_id": str(reg.pk),
                "graduate": reg.is_graduated,
                "message": "Graduate status updated.",
            }
        )

    snapshot_updated = _update_template_snapshot_candidate(
        registration_id, "graduate", graduate
    )
    if snapshot_updated:
        return JsonResponse(
            {
                "ok": True,
                "registration_id": registration_id,
                "graduate": graduate,
                "message": "Graduate status updated.",
            }
        )

    return JsonResponse(
        {"ok": False, "message": "Student record not found."},
        status=404,
    )
