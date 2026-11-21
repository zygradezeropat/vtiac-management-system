"""Registrar pending enrollment approval — list and approve/reject."""

import json
from decimal import Decimal

from django.contrib.auth.decorators import login_required
from django.db.models import Count, Prefetch, Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from backend.accounts.services import require_portal_access
from backend.student.models import (
    StudentEnrollmentProfile,
    StudentPaymentProof,
    StudentRegistration,
)
from backend.student.document_review import documents_cleared_for_payment
from backend.student.document_submission import get_document_submission_indicators
from backend.student.payment_records import profile_has_payment
from backend.cashier.balance import fee_balance_for_profile
from backend.student.services import SCHOLARSHIP_TYPE_CHOICES

from backend.core.models import StaffProfile
from backend.system_admin.touch_logger import log_staff_touch
from .services import REGISTRAR_ROLE

_SCHOLARSHIP_LABELS = dict(SCHOLARSHIP_TYPE_CHOICES)


def is_registrar_staff_touched(profile, reg) -> bool:
    """Check if an enrollment/profile has already been touched by dedicated Registrar staff."""
    if profile:
        if profile.documents_review_released:
            if not profile.documents_review_released_by or getattr(getattr(profile.documents_review_released_by, "staff_profile", None), "role", "") == StaffProfile.Role.REGISTRAR:
                return True
        if profile.hard_copies_received_by and getattr(getattr(profile.hard_copies_received_by, "staff_profile", None), "role", "") == StaffProfile.Role.REGISTRAR:
            return True
        if profile.last_touched_by and getattr(getattr(profile.last_touched_by, "staff_profile", None), "role", "") == StaffProfile.Role.REGISTRAR:
            return True
    if reg and reg.approved_by and getattr(getattr(reg.approved_by, "staff_profile", None), "role", "") == StaffProfile.Role.REGISTRAR:
        return True
    return False


def _program_for_profile(
    profile: StudentEnrollmentProfile | None,
    reg: StudentRegistration | None = None,
) -> str:
    if profile:
        program = profile.selected_program or ""
        if not program and profile.registration_id and profile.registration:
            program = profile.registration.selected_program or ""
        if program:
            return program
    if reg:
        return reg.selected_program or ""
    return ""


def _fee_balance(profile: StudentEnrollmentProfile | None, reg: StudentRegistration | None = None) -> dict:
    program = _program_for_profile(profile, reg)
    return fee_balance_for_profile(profile, program)


def _registration_for_profile(profile: StudentEnrollmentProfile | None):
    if not profile:
        return None
    if profile.registration_id:
        return profile.registration
    if profile.user_id:
        return getattr(profile.user, "registration_application", None)
    return None


def _profile_for_registration(reg: StudentRegistration):
    try:
        profile = reg.tesda_profile
        if profile:
            return profile
    except StudentEnrollmentProfile.DoesNotExist:
        pass
    if reg.user_id:
        return getattr(reg.user, "enrollment_profile", None)
    return StudentEnrollmentProfile.objects.filter(registration_id=reg.pk).first()


def pending_registration_queryset():
    """All applications still open (not approved or rejected by registrar)."""
    return (
        StudentRegistration.objects.filter(status=StudentRegistration.Status.PENDING)
        .select_related("user")
        .prefetch_related(
            Prefetch(
                "tesda_profile",
                queryset=StudentEnrollmentProfile.objects.annotate(
                    _proof_count=Count("payment_proofs")
                ).prefetch_related("payment_proofs"),
            )
        )
        .order_by("-created_at")
    )


def pending_enrollment_queryset():
    """Profiles linked to open applications (used by approve/reject when profile exists)."""
    reg_ids = pending_registration_queryset().values_list("pk", flat=True)
    return (
        StudentEnrollmentProfile.objects.filter(
            Q(registration_id__in=reg_ids)
            | Q(user__registration_application_id__in=reg_ids)
        )
        .select_related("user", "registration")
        .prefetch_related("payment_proofs")
        .distinct()
    )


def pending_enrollment_count() -> int:
    return pending_registration_queryset().count()


def _scholarship_display(scholarship_type: str) -> tuple[str, str]:
    if not scholarship_type:
        return "Regular", ""
    label = _SCHOLARSHIP_LABELS.get(scholarship_type, scholarship_type)
    if scholarship_type in ("", "others"):
        return label or "Regular", ""
    return f"Scholar — {label}", "registrar-enrollment-scholarship"


def _format_datetime(dt) -> str:
    if not dt:
        return ""
    return timezone.localtime(dt).strftime("%Y-%m-%d, %I:%M %p").replace(" 0", " ")


def _needed_status(
    profile: StudentEnrollmentProfile | None,
    *,
    has_payment: bool,
    reg: StudentRegistration | None = None,
) -> dict:
    """Capsule label + CSS class for what the student still needs."""
    if not profile or not profile.profile_step_completed:
        return {
            "key": "profile",
            "label": "Needs: Learner profile",
            "badgeClass": "registrar-enrollment-status--profile",
        }
    reqs_cleared = profile.requirements_submitted or documents_cleared_for_payment(profile)
    if not reqs_cleared:
        return {
            "key": "requirements",
            "label": "Needs: Requirements upload",
            "badgeClass": "registrar-enrollment-status--requirements",
        }
    if not documents_cleared_for_payment(profile):
        return {
            "key": "document_review",
            "label": "Needs: Document review",
            "badgeClass": "registrar-enrollment-status--requirements",
        }

    balance = _fee_balance(profile, reg)
    total_paid = Decimal(str(balance["totalPaid"]))
    total_remaining = Decimal(str(balance["totalRemaining"]))

    if total_paid <= 0 and not has_payment:
        return {
            "key": "payment_unpaid",
            "label": "Payment: Unpaid",
            "badgeClass": "registrar-enrollment-status--unpaid",
            "paymentStatus": "unpaid",
        }

    if total_remaining > 0:
        return {
            "key": "payment_partial",
            "label": "Payment: Partially Paid",
            "badgeClass": "registrar-enrollment-payment--partial",
            "paymentStatus": "partial",
        }

    if total_paid > 0 or has_payment:
        return {
            "key": "payment_full",
            "label": "Payment: Fully Paid",
            "badgeClass": "registrar-enrollment-payment--full",
            "paymentStatus": "full",
        }

    return {
        "key": "payment_unpaid",
        "label": "Payment: Unpaid",
        "badgeClass": "registrar-enrollment-status--unpaid",
        "paymentStatus": "unpaid",
    }


def _serialize_item(reg: StudentRegistration, profile: StudentEnrollmentProfile | None) -> dict:
    has_payment = profile_has_payment(profile, reg)
    balance = _fee_balance(profile, reg)
    total = int(balance["totalAssessed"])
    paid = int(balance["totalPaid"])
    is_settled = balance["totalRemaining"] <= 0 and (paid > 0 or has_payment)
    needed = _needed_status(profile, has_payment=(has_payment or is_settled), reg=reg)
    payment_status = needed.get("paymentStatus") or (
        "full"
        if is_settled or (paid > 0 and balance["totalRemaining"] <= 0)
        else ("partial" if paid > 0 or has_payment else "unpaid")
    )
    latest_proof = profile.payment_proofs.order_by("-uploaded_at").first() if profile else None

    if profile:
        name = f"{profile.first_name} {profile.last_name}".strip()
        email = profile.email
        phone = profile.contact_number
        program = profile.selected_program or (reg.selected_program if reg else "")
        scholarship_type = profile.scholarship_type
        verified_dt = profile.requirements_submitted_at or profile.updated_at
    else:
        name = f"{reg.first_name} {reg.last_name}".strip()
        email = reg.email
        phone = reg.phone_number
        program = reg.selected_program
        scholarship_type = ""
        verified_dt = reg.created_at

    scholarship, scholarship_badge_class = _scholarship_display(scholarship_type)

    ref = ""
    doc_url = ""
    doc_name = ""
    if latest_proof:
        ref = latest_proof.reference_note or f"PROOF-{latest_proof.pk}"
        if latest_proof.file:
            doc_url = latest_proof.file.url
            doc_name = latest_proof.original_filename or latest_proof.file.name.split("/")[-1]

    reqs_cleared = bool(
        profile
        and (profile.requirements_submitted or documents_cleared_for_payment(profile))
    )
    can_approve = bool(
        profile
        and profile.profile_step_completed
        and reqs_cleared
        and (is_settled or (paid > 0 and balance["totalRemaining"] <= 0) or (has_payment and balance["totalRemaining"] <= 0))
        and reg
    )

    program_type = (
        profile.program_type
        if profile and profile.program_type
        else reg.program_type
    )

    doc_indicators = get_document_submission_indicators(profile, reg)

    touched_by_reg = is_registrar_staff_touched(profile, reg)
    last_touch_by_name = ""
    last_touch_by_role = ""
    if profile:
        lt_user = profile.last_touched_by or profile.documents_review_released_by or profile.hard_copies_received_by
        if lt_user:
            last_touch_by_name = lt_user.get_full_name().strip() or lt_user.username
            last_touch_by_role = profile.last_touched_role or getattr(getattr(lt_user, "staff_profile", None), "role", "")
    elif reg and reg.approved_by:
        last_touch_by_name = reg.approved_by.get_full_name().strip() or reg.approved_by.username
        last_touch_by_role = getattr(getattr(reg.approved_by, "staff_profile", None), "role", "")

    return {
        "id": profile.pk if profile else None,
        "registrationId": str(reg.pk),
        "programType": program_type,
        "name": name or "—",
        "email": email or "—",
        "phone": phone or "",
        "program": program or "—",
        "scholarship": scholarship,
        "scholarshipBadgeClass": scholarship_badge_class,
        "status": "Pending Enrollment",
        "verifiedDate": verified_dt.strftime("%Y-%m-%d") if verified_dt else "",
        "neededLabel": needed["label"],
        "neededKey": needed["key"],
        "neededBadgeClass": needed["badgeClass"],
        "paymentStatus": payment_status,
        "paidAmount": paid,
        "totalAmount": total,
        "paymentReference": ref,
        "referenceId": reg.reference_id,
        "canApprove": can_approve,
        "registrarStaffTouched": touched_by_reg,
        "lastTouchByName": last_touch_by_name,
        "lastTouchByRole": last_touch_by_role,
        "digitalStatus": doc_indicators["digital"]["status"],
        "digitalLabel": doc_indicators["digital"]["label"],
        "digitalBadgeClass": doc_indicators["digital"]["badgeClass"],
        "isDigitalUploaded": doc_indicators["digital"]["isUploaded"],
        "hardCopyStatus": doc_indicators["hardCopy"]["status"],
        "hardCopyLabel": doc_indicators["hardCopy"]["label"],
        "hardCopyBadgeClass": doc_indicators["hardCopy"]["badgeClass"],
        "hardCopiesSubmitted": doc_indicators["hardCopy"]["isSubmitted"],
        "hardCopySubmittedAt": doc_indicators["hardCopy"]["submittedAt"],
        "docIndicators": doc_indicators,
        "cashierApproval": {
            "cashierName": "Cashier (payment proof on file)" if has_payment else "",
            "cashierRole": "Cashier",
            "approvedAt": _format_datetime(latest_proof.uploaded_at if latest_proof else None),
            "referenceNo": ref,
            "signatureLabel": "Verified" if has_payment else "",
            "documentName": doc_name or ("Proof of payment" if has_payment else ""),
            "documentUrl": doc_url,
        },
    }


def is_payment_unpaid(profile: StudentEnrollmentProfile | None) -> bool:
    """True when registrar capsule would show Payment: Unpaid (ready for cashier)."""
    if not profile:
        return False
    has_payment = profile_has_payment(profile)
    reg = _registration_for_profile(profile)
    return _needed_status(profile, has_payment=has_payment, reg=reg)["key"] == "payment_unpaid"


def _pending_items_for_queryset():
    items = []
    for reg in pending_registration_queryset():
        profile = _profile_for_registration(reg)
        if profile and not hasattr(profile, "_proof_count"):
            profile = (
                StudentEnrollmentProfile.objects.filter(pk=profile.pk)
                .prefetch_related("payment_proofs")
                .first()
            )
        items.append(_serialize_item(reg, profile))
    return items


def pending_programs_by_type() -> tuple[set[str], set[str]]:
    """Program names with open applications, split by training vs assessment-only."""
    training: set[str] = set()
    assessment: set[str] = set()
    for reg in pending_registration_queryset():
        program = (reg.selected_program or "").strip()
        if not program:
            continue
        if reg.program_type == StudentRegistration.ProgramType.ASSESSMENT_ONLY:
            assessment.add(program)
        else:
            training.add(program)
    return training, assessment


def pending_enrollments_payload(request=None):
    """Tabbed payload for registrar enrollment page (training vs assessment-only)."""
    training = []
    assessment = []
    for item in _pending_items_for_queryset():
        if item.get("programType") == StudentRegistration.ProgramType.ASSESSMENT_ONLY:
            assessment.append(item)
        else:
            training.append(item)

    def tab(key: str, title: str, tab_items: list):
        count = len(tab_items)
        if key == "assessment":
            badge = f"{count} pending" if count else "0 pending"
        else:
            badge = f"{count} pending" if count else "0 pending"
        return {
            "key": key,
            "title": title,
            "badgeLabel": badge,
            "items": tab_items,
        }

    modules = [
        tab("training", "Training with Assessment", training),
        tab("assessment", "Assessment Only (Candidates)", assessment),
    ]
    curr_primary_role = ""
    if request and hasattr(request, "user") and request.user.is_authenticated and hasattr(request.user, "staff_profile"):
        curr_primary_role = request.user.staff_profile.role

    return {
        "totalCount": len(training) + len(assessment),
        "modules": modules,
        "currentUserPrimaryRole": curr_primary_role,
    }


def _resolve_item(profile_id: int | None, registration_id: str | None):
    reg = None
    profile = None

    if registration_id:
        try:
            reg = pending_registration_queryset().get(pk=registration_id)
        except (StudentRegistration.DoesNotExist, ValueError):
            try:
                reg = StudentRegistration.objects.select_related("user").get(pk=registration_id)
            except (StudentRegistration.DoesNotExist, ValueError):
                return None, None
        profile = _profile_for_registration(reg)
    elif profile_id:
        try:
            profile = pending_enrollment_queryset().get(pk=profile_id)
        except (StudentEnrollmentProfile.DoesNotExist, ValueError):
            try:
                profile = StudentEnrollmentProfile.objects.select_related("user").get(pk=profile_id)
            except (StudentEnrollmentProfile.DoesNotExist, ValueError):
                return None, None
        reg = _registration_for_profile(profile)

    return profile, reg


def _action_ids_from_request(request):
    profile_id = request.POST.get("profile_id") or request.GET.get("profile_id")
    registration_id = request.POST.get("registration_id") or request.GET.get("registration_id")
    pid = int(profile_id) if profile_id not in (None, "") else None
    return pid, registration_id or None


def _approve_enrollment_item(profile, reg, user=None) -> tuple[bool, str | None]:
    """Shared validation + approval for single and bulk registrar actions."""
    if not reg:
        return False, "Enrollment not found."

    user_primary_role = getattr(getattr(user, "staff_profile", None), "role", "") if user else ""
    if user_primary_role == StaffProfile.Role.CASHIER and is_registrar_staff_touched(profile, reg):
        return False, "Permission denied: This enrollment was processed by Registrar staff and cannot be modified while acting as registrar."

    if reg.status == StudentRegistration.Status.APPROVED:
        # Already officially enrolled! Trigger email attempt again and return ok.
        from backend.student.enrollment_notifications import send_approval_notifications_in_background
        send_approval_notifications_in_background(profile, reg, force=False)
        return True, "already_approved"

    if profile:
        reqs_cleared = profile.requirements_submitted or documents_cleared_for_payment(profile)
        if not profile.profile_step_completed or not reqs_cleared:
            return False, "Student has not completed profile and requirements yet."
        if not documents_cleared_for_payment(profile):
            return False, "All enrollment documents must be approved and released first."
        balance = _fee_balance(profile, reg)
        total_remaining = Decimal(str(balance.get("totalRemaining", 0)))
        total_paid = Decimal(str(balance.get("totalPaid", 0)))
        is_settled = balance.get("isFullyPaid", False) or total_remaining <= Decimal("0")
        has_payment = profile_has_payment(profile, reg) or is_settled or (total_paid > Decimal("0"))

        if not has_payment:
            return (
                False,
                "Payment proof is not on file yet. Student must complete payment first.",
            )

        if total_remaining > Decimal("0"):
            return False, "Payment must be fully settled before approval."
    else:
        return False, "Student has not started the learner profile yet."

    now = timezone.now()
    reg.status = StudentRegistration.Status.APPROVED
    update_fields = ["status"]
    if user and getattr(user, "is_authenticated", False):
        reg.approved_by = user
        update_fields.append("approved_by")
    reg.save(update_fields=update_fields)

    if profile and user and getattr(user, "is_authenticated", False):
        profile.last_touched_by = user
        profile.last_touched_at = now
        profile.last_touched_role = user_primary_role or "registrar"
        profile.save(update_fields=["last_touched_by", "last_touched_at", "last_touched_role", "updated_at"])

    log_staff_touch(
        user=user,
        portal_role="registrar",
        module="registrar",
        action="Approved Official Enrollment",
        target_type="StudentRegistration",
        target_id=reg.reference_id,
        target_name=f"{reg.first_name} {reg.last_name}",
        details=f"Program: {reg.selected_program} | Status: Approved",
    )

    from backend.student.enrollment_notifications import send_approval_notifications_in_background

    send_approval_notifications_in_background(profile, reg, force=False)
    return True, None


def _bulk_items_from_request(request) -> list[dict]:
    if request.content_type and "application/json" in request.content_type:
        try:
            body = json.loads(request.body.decode() or "{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            body = {}
        items = body.get("items")
        return items if isinstance(items, list) else []

    profile_ids = request.POST.getlist("profile_id")
    registration_ids = request.POST.getlist("registration_id")
    if profile_ids or registration_ids:
        count = max(len(profile_ids), len(registration_ids))
        items = []
        for i in range(count):
            items.append(
                {
                    "profileId": profile_ids[i] if i < len(profile_ids) else None,
                    "registrationId": registration_ids[i] if i < len(registration_ids) else None,
                }
            )
        return items
    return []


@login_required(login_url="/")
@require_http_methods(["POST"])
def enrollment_approve(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return denied

    profile_id, registration_id = _action_ids_from_request(request)
    profile, reg = _resolve_item(profile_id, registration_id)

    ok, error = _approve_enrollment_item(profile, reg, user=request.user)
    if not ok:
        if error and "Permission denied" in error:
            return JsonResponse({"error": error}, status=403)
        status = 404 if error == "Enrollment not found." else 400
        return JsonResponse({"error": error}, status=status)

    is_already = (error == "already_approved")
    return JsonResponse(
        {
            "ok": True,
            "already_approved": is_already,
            "message": "Student was already approved and enrolled." if is_already else "Enrollment approved successfully.",
            "profile_id": profile.pk if profile else None,
            "registration_id": str(reg.pk),
            "status": reg.status,
            "pending_count": pending_enrollment_count(),
        }
    )


@login_required(login_url="/")
@require_http_methods(["POST"])
def enrollment_bulk_approve(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return denied

    items = _bulk_items_from_request(request)
    if not items:
        return JsonResponse({"error": "No enrollments selected."}, status=400)

    approved = []
    failed = []

    for raw in items:
        if not isinstance(raw, dict):
            continue
        profile_id = raw.get("profileId") or raw.get("profile_id")
        registration_id = raw.get("registrationId") or raw.get("registration_id")
        pid = int(profile_id) if profile_id not in (None, "") else None
        profile, reg = _resolve_item(pid, registration_id or None)
        ok, error = _approve_enrollment_item(profile, reg, user=request.user)
        key = {
            "profileId": profile.pk if profile else None,
            "registrationId": str(reg.pk) if reg else registration_id,
        }
        if ok:
            approved.append(key)
        else:
            failed.append({**key, "error": error})

    if not approved and failed:
        first_err = failed[0]["error"]
        status_code = 403 if "Permission denied" in first_err else 400
        return JsonResponse(
            {
                "error": first_err,
                "failed": failed,
                "pending_count": pending_enrollment_count(),
            },
            status=status_code,
        )

    return JsonResponse(
        {
            "ok": True,
            "approvedCount": len(approved),
            "approved": approved,
            "failed": failed,
            "pending_count": pending_enrollment_count(),
        }
    )


@login_required(login_url="/")
@require_http_methods(["POST"])
def enrollment_reject(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return denied

    profile_id, registration_id = _action_ids_from_request(request)
    profile, reg = _resolve_item(profile_id, registration_id)

    if not reg:
        return JsonResponse({"error": "Enrollment not found or already processed."}, status=404)

    user_primary_role = getattr(getattr(request.user, "staff_profile", None), "role", "")
    if user_primary_role == StaffProfile.Role.CASHIER and is_registrar_staff_touched(profile, reg):
        return JsonResponse(
            {"error": "Permission denied: This enrollment was processed by Registrar staff and cannot be modified while acting as registrar."},
            status=403,
        )

    now = timezone.now()
    reg.status = StudentRegistration.Status.REJECTED
    reg.save(update_fields=["status"])

    if profile:
        profile.last_touched_by = request.user
        profile.last_touched_at = now
        profile.last_touched_role = user_primary_role or "registrar"
        profile.save(update_fields=["last_touched_by", "last_touched_at", "last_touched_role", "updated_at"])

    log_staff_touch(
        user=request.user,
        portal_role="registrar",
        module="registrar",
        action="Rejected Enrollment Application",
        target_type="StudentRegistration",
        target_id=reg.reference_id,
        target_name=f"{reg.first_name} {reg.last_name}",
        details=f"Program: {reg.selected_program} | Status: Rejected",
    )

    from backend.student.enrollment_notifications import notify_enrollment_rejected

    notify_enrollment_rejected(profile, reg)

    return JsonResponse(
        {
            "ok": True,
            "profile_id": profile.pk if profile else None,
            "registration_id": str(reg.pk),
            "status": reg.status,
            "pending_count": pending_enrollment_count(),
        }
    )
