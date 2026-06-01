"""Registrar pending enrollment approval — list and approve/reject."""

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
from backend.student.payment_records import profile_has_payment
from backend.cashier.balance import fee_balance_for_profile
from backend.student.services import SCHOLARSHIP_TYPE_CHOICES

from .services import REGISTRAR_ROLE

_SCHOLARSHIP_LABELS = dict(SCHOLARSHIP_TYPE_CHOICES)


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
    if not profile.requirements_submitted:
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
    has_payment = profile_has_payment(profile)
    needed = _needed_status(profile, has_payment=has_payment, reg=reg)
    balance = _fee_balance(profile, reg)
    total = int(balance["totalAssessed"])
    paid = int(balance["totalPaid"])
    payment_status = needed.get("paymentStatus") or (
        "full"
        if paid > 0 and balance["totalRemaining"] <= 0
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

    can_approve = bool(
        profile
        and profile.profile_step_completed
        and profile.requirements_submitted
        and paid > 0
        and balance["totalRemaining"] <= 0
        and reg
    )

    program_type = (
        profile.program_type
        if profile and profile.program_type
        else reg.program_type
    )

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


def pending_enrollments_payload():
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
        tab("assessment", "Assessment Only Clients", assessment),
    ]
    return {
        "totalCount": len(training) + len(assessment),
        "modules": modules,
    }


def _resolve_item(profile_id: int | None, registration_id: str | None):
    reg = None
    profile = None

    if registration_id:
        try:
            reg = pending_registration_queryset().get(pk=registration_id)
        except (StudentRegistration.DoesNotExist, ValueError):
            return None, None
        profile = _profile_for_registration(reg)
    elif profile_id:
        try:
            profile = pending_enrollment_queryset().get(pk=profile_id)
        except StudentEnrollmentProfile.DoesNotExist:
            return None, None
        reg = _registration_for_profile(profile)
        if reg and reg.status != StudentRegistration.Status.PENDING:
            return None, None

    return profile, reg


def _action_ids_from_request(request):
    profile_id = request.POST.get("profile_id") or request.GET.get("profile_id")
    registration_id = request.POST.get("registration_id") or request.GET.get("registration_id")
    pid = int(profile_id) if profile_id not in (None, "") else None
    return pid, registration_id or None


@login_required(login_url="/")
@require_http_methods(["POST"])
def enrollment_approve(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return denied

    profile_id, registration_id = _action_ids_from_request(request)
    profile, reg = _resolve_item(profile_id, registration_id)

    if not reg:
        return JsonResponse({"error": "Enrollment not found or already processed."}, status=404)

    if profile:
        if not profile.profile_step_completed or not profile.requirements_submitted:
            return JsonResponse(
                {"error": "Student has not completed profile and requirements yet."},
                status=400,
            )
        if not profile_has_payment(profile):
            return JsonResponse(
                {"error": "Payment proof is not on file yet. Student must complete payment first."},
                status=400,
            )
    else:
        return JsonResponse(
            {"error": "Student has not started the learner profile yet."},
            status=400,
        )

    reg.status = StudentRegistration.Status.APPROVED
    reg.save(update_fields=["status"])

    return JsonResponse(
        {
            "ok": True,
            "profile_id": profile.pk if profile else None,
            "registration_id": str(reg.pk),
            "status": reg.status,
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

    reg.status = StudentRegistration.Status.REJECTED
    reg.save(update_fields=["status"])

    return JsonResponse(
        {
            "ok": True,
            "profile_id": profile.pk if profile else None,
            "registration_id": str(reg.pk),
            "status": reg.status,
            "pending_count": pending_enrollment_count(),
        }
    )
