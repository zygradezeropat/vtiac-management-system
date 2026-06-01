"""Registrar API — approve / reject enrollment documents before payment."""

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from backend.accounts.services import require_portal_access
from backend.student.document_review import (
    approve_document,
    reject_document,
    release_document_review,
)
from backend.student.models import StudentEnrollmentProfile

from .enrollment_detail import build_learner_profile_detail
from .pending_enrollment import _profile_for_registration, _registration_for_profile
from .services import REGISTRAR_ROLE


def _profile_from_request(request):
    profile_id = request.POST.get("profile_id")
    registration_id = request.POST.get("registration_id")
    profile = None
    reg = None

    if profile_id:
        try:
            profile = StudentEnrollmentProfile.objects.prefetch_related("documents").get(
                pk=int(profile_id)
            )
        except (StudentEnrollmentProfile.DoesNotExist, ValueError):
            return None, None, JsonResponse({"error": "Profile not found."}, status=404)
        reg = _registration_for_profile(profile)
    elif registration_id:
        from backend.student.models import StudentRegistration

        try:
            reg = StudentRegistration.objects.get(pk=registration_id)
        except (StudentRegistration.DoesNotExist, ValueError):
            return None, None, JsonResponse({"error": "Registration not found."}, status=404)
        profile = _profile_for_registration(reg)
        if not profile:
            return None, reg, JsonResponse({"error": "No enrollment profile yet."}, status=400)
    else:
        return None, None, JsonResponse(
            {"error": "profile_id or registration_id is required."}, status=400
        )

    if not profile:
        return None, reg, JsonResponse({"error": "No enrollment profile."}, status=400)
    return profile, reg, None


@login_required(login_url="/")
@require_http_methods(["POST"])
def document_approve(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return denied

    profile, reg, err = _profile_from_request(request)
    if err:
        return err

    document_key = (request.POST.get("document_key") or "").strip()
    if not document_key:
        return JsonResponse({"error": "document_key is required."}, status=400)

    try:
        approve_document(profile, document_key)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    detail = build_learner_profile_detail(profile, reg)
    return JsonResponse(detail)


@login_required(login_url="/")
@require_http_methods(["POST"])
def document_reject(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return denied

    profile, reg, err = _profile_from_request(request)
    if err:
        return err

    document_key = (request.POST.get("document_key") or "").strip()
    reason = (request.POST.get("reason") or "").strip()
    if not document_key:
        return JsonResponse({"error": "document_key is required."}, status=400)

    try:
        reject_document(profile, document_key, reason)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    detail = build_learner_profile_detail(profile, reg)
    return JsonResponse(detail)


@login_required(login_url="/")
@require_http_methods(["POST"])
def document_release(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return denied

    profile, reg, err = _profile_from_request(request)
    if err:
        return err

    try:
        release_document_review(profile)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    detail = build_learner_profile_detail(profile, reg)
    return JsonResponse(detail)
