import json

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from backend.accounts.services import require_portal_access
from backend.core.models import StaffProfile
from backend.student.document_review import (
    approve_document,
    reject_document,
    release_document_review,
)
from backend.student.models import StudentEnrollmentProfile
from backend.system_admin.touch_logger import log_staff_touch

from .enrollment_detail import build_learner_profile_detail
from .pending_enrollment import (
    _profile_for_registration,
    _registration_for_profile,
    is_registrar_staff_touched,
)
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

    user_primary_role = getattr(getattr(request.user, "staff_profile", None), "role", "")
    if user_primary_role == StaffProfile.Role.CASHIER and is_registrar_staff_touched(profile, reg):
        return JsonResponse(
            {"error": "Permission denied: This enrollment was processed by Registrar staff and cannot be modified while acting as registrar."},
            status=403,
        )

    document_key = (request.POST.get("document_key") or "").strip()
    if not document_key:
        return JsonResponse({"error": "document_key is required."}, status=400)

    try:
        approve_document(profile, document_key, user=request.user)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    student_name = f"{profile.first_name} {profile.last_name}".strip()
    log_staff_touch(
        user=request.user,
        portal_role="registrar",
        module="registrar",
        action=f"Approved Document: {document_key}",
        target_type="StudentEnrollmentDocument",
        target_id=profile.pk,
        target_name=student_name,
        details=f"Document '{document_key}' approved by {request.user.get_full_name() or request.user.username}",
    )

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

    user_primary_role = getattr(getattr(request.user, "staff_profile", None), "role", "")
    if user_primary_role == StaffProfile.Role.CASHIER and is_registrar_staff_touched(profile, reg):
        return JsonResponse(
            {"error": "Permission denied: This enrollment was processed by Registrar staff and cannot be modified while acting as registrar."},
            status=403,
        )

    document_key = (request.POST.get("document_key") or "").strip()
    reason = (request.POST.get("reason") or "").strip()
    if not document_key:
        return JsonResponse({"error": "document_key is required."}, status=400)

    try:
        reject_document(profile, document_key, reason, user=request.user)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    student_name = f"{profile.first_name} {profile.last_name}".strip()
    log_staff_touch(
        user=request.user,
        portal_role="registrar",
        module="registrar",
        action=f"Rejected Document: {document_key}",
        target_type="StudentEnrollmentDocument",
        target_id=profile.pk,
        target_name=student_name,
        details=f"Document '{document_key}' rejected: {reason}",
    )

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

    user_primary_role = getattr(getattr(request.user, "staff_profile", None), "role", "")
    if user_primary_role == StaffProfile.Role.CASHIER and is_registrar_staff_touched(profile, reg):
        return JsonResponse(
            {"error": "Permission denied: This enrollment was processed by Registrar staff and cannot be modified while acting as registrar."},
            status=403,
        )

    try:
        release_document_review(profile, user=request.user)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    student_name = f"{profile.first_name} {profile.last_name}".strip()
    log_staff_touch(
        user=request.user,
        portal_role="registrar",
        module="registrar",
        action="Released to Payment Step",
        target_type="StudentEnrollmentProfile",
        target_id=profile.pk,
        target_name=student_name,
        details="Cleared requirements for payment step",
    )

    detail = build_learner_profile_detail(profile, reg)
    return JsonResponse(detail)


@login_required(login_url="/")
@require_http_methods(["POST"])
def hard_copies_update(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return denied

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
            return JsonResponse({"error": "Profile not found."}, status=404)
        reg = _registration_for_profile(profile)
    elif registration_id:
        from backend.student.models import StudentRegistration

        try:
            reg = StudentRegistration.objects.get(pk=registration_id)
        except (StudentRegistration.DoesNotExist, ValueError):
            return JsonResponse({"error": "Registration not found."}, status=404)
        profile = _profile_for_registration(reg)
    else:
        return JsonResponse({"error": "profile_id or registration_id is required."}, status=400)

    user_primary_role = getattr(getattr(request.user, "staff_profile", None), "role", "")
    if user_primary_role == StaffProfile.Role.CASHIER and is_registrar_staff_touched(profile, reg):
        return JsonResponse(
            {"error": "Permission denied: This enrollment was processed by Registrar staff and cannot be modified while acting as registrar."},
            status=403,
        )

    submitted_val = request.POST.get("hard_copies_submitted", "").strip().lower()
    submitted = submitted_val in ("1", "true", "yes", "on")
    notes = (request.POST.get("notes") or "").strip()

    docs_json = request.POST.get("documents")
    docs_map = None
    if docs_json:
        try:
            docs_map = json.loads(docs_json)
        except (json.JSONDecodeError, TypeError):
            docs_map = None

    from backend.student.document_submission import update_hard_copies_submission

    update_hard_copies_submission(
        profile,
        reg,
        submitted,
        notes=notes,
        documents_map=docs_map,
        received_by=request.user,
    )

    if profile:
        profile.last_touched_by = request.user
        profile.last_touched_at = timezone.now()
        profile.last_touched_role = user_primary_role or "registrar"
        profile.save(update_fields=["last_touched_by", "last_touched_at", "last_touched_role", "updated_at"])

    student_name = f"{profile.first_name} {profile.last_name}".strip() if profile else ""
    log_staff_touch(
        user=request.user,
        portal_role="registrar",
        module="registrar",
        action="Updated Hard Copies Checklist",
        target_type="StudentEnrollmentProfile",
        target_id=profile.pk if profile else "",
        target_name=student_name,
        details=f"Submitted: {submitted} | Notes: {notes[:100]}",
    )

    detail = build_learner_profile_detail(profile, reg)
    return JsonResponse(detail)
