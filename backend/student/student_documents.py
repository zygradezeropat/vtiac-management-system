
from django.urls import reverse
from django.utils import timezone

from .models import StudentEnrollmentProfile, StudentRegistration

STATUS_READY = "ready"
STATUS_PENDING_PAYMENT = "pending_payment"
STATUS_PROCESSING = "processing"

STATUS_LABELS = {
    STATUS_READY: "Ready",
    STATUS_PENDING_PAYMENT: "Pending Payment",
    STATUS_PROCESSING: "Processing",
}


def _format_doc_date(dt):
    if not dt:
        return "—"
    return dt.strftime("%B %d, %Y")


def _profile_form_status(profile):
    if profile and profile.profile_step_completed:
        return STATUS_READY
    return STATUS_PROCESSING


def _receipt_status(profile, registration):
    if registration and registration.status == StudentRegistration.Status.APPROVED:
        return STATUS_READY
    from .payment_records import profile_has_payment

    if profile and profile_has_payment(profile):
        return STATUS_PROCESSING
    return STATUS_PENDING_PAYMENT


def _confirmation_slip_status(profile, registration):
    if registration and registration.status == StudentRegistration.Status.APPROVED:
        return STATUS_READY
    if profile and profile.requirements_submitted:
        return STATUS_PROCESSING
    return STATUS_PENDING_PAYMENT


def _build_doc_row(
    *,
    key,
    title,
    icon,
    status,
    date_display,
    size_display,
    can_view=False,
    can_download=False,
    view_url="",
    download_url="",
):
    return {
        "key": key,
        "title": title,
        "icon": icon,
        "status": status,
        "status_label": STATUS_LABELS[status],
        "date_display": date_display,
        "size_display": size_display,
        "meta_line": f"Date: {date_display}" + (f" • {size_display}" if size_display else ""),
        "can_view": can_view and bool(view_url),
        "can_download": can_download and bool(download_url),
        "view_url": view_url,
        "download_url": download_url,
    }


def build_student_documents(profile, registration=None):
    """Issued documents list for the My Documents page (matches portal mockup)."""
    profile_status = _profile_form_status(profile)
    receipt_status = _receipt_status(profile, registration)
    slip_status = _confirmation_slip_status(profile, registration)

    profile_date = _format_doc_date(profile.updated_at if profile else None)
    receipt_dt = None
    if profile and receipt_status in (STATUS_READY, STATUS_PROCESSING):
        latest_proof = profile.payment_proofs.order_by("-uploaded_at").first()
        if latest_proof:
            receipt_dt = latest_proof.uploaded_at
        elif receipt_status == STATUS_READY and profile.requirements_submitted_at:
            receipt_dt = profile.requirements_submitted_at
    receipt_date = _format_doc_date(receipt_dt)
    slip_dt = None
    if slip_status == STATUS_READY:
        if profile and profile.requirements_submitted_at:
            slip_dt = profile.requirements_submitted_at
        elif registration:
            slip_dt = registration.created_at
    slip_date = _format_doc_date(slip_dt)

    def url(name, key):
        try:
            return reverse(name, kwargs={"doc_key": key})
        except Exception:
            return ""

    rows = [
        _build_doc_row(
            key="profile_form",
            title="Learner's Profile Form",
            icon="bi-file-earmark-person",
            status=profile_status,
            date_display=profile_date if profile_status == STATUS_READY else "—",
            size_display="245 KB" if profile_status == STATUS_READY else "",
            can_view=profile_status == STATUS_READY,
            can_download=profile_status == STATUS_READY,
            view_url=url("student_document_view", "profile_form"),
            download_url=url("student_document_download", "profile_form"),
        ),
        _build_doc_row(
            key="official_receipt",
            title="Official Receipt",
            icon="bi-credit-card",
            status=receipt_status,
            date_display=receipt_date,
            size_display="128 KB" if receipt_status == STATUS_READY else "",
            can_view=receipt_status == STATUS_READY,
            can_download=receipt_status == STATUS_READY,
            view_url=url("student_document_view", "official_receipt"),
            download_url=url("student_document_download", "official_receipt"),
        ),
        _build_doc_row(
            key="confirmation_slip",
            title="Confirmation Slip",
            icon="bi-file-earmark-check",
            status=slip_status,
            date_display=slip_date,
            size_display="312 KB" if slip_status == STATUS_READY else "",
            can_view=slip_status == STATUS_READY,
            can_download=slip_status == STATUS_READY,
            view_url=url("student_document_view", "confirmation_slip"),
            download_url=url("student_document_download", "confirmation_slip"),
        ),
        _build_doc_row(
            key="student_handbook",
            title="Student Handbook",
            icon="bi-book",
            status=STATUS_READY,
            date_display="March 31, 2026",
            size_display="1.2 MB",
            can_view=True,
            can_download=True,
            view_url=url("student_document_view", "student_handbook"),
            download_url=url("student_document_download", "student_handbook"),
        ),
    ]
    return rows


def student_documents_context(request):
    from .services import _student_portal_base, get_enrollment_profile
    from .models import StudentDocumentRequest

    profile = get_enrollment_profile(request.user)
    registration = getattr(request.user, "registration_application", None)

    my_requests = []
    if request.user.is_authenticated:
        req_rows = StudentDocumentRequest.objects.filter(user=request.user).order_by("-requested_at")
        for r in req_rows:
            my_requests.append({
                "id": r.id,
                "document_name": r.document_name,
                "purpose": r.purpose,
                "status": r.status,
                "status_display": r.get_status_display(),
                "remarks": r.remarks,
                "release_date": r.release_date.strftime("%B %d, %Y") if r.release_date else "",
                "requested_at": _format_doc_date(r.requested_at),
            })

    return _student_portal_base(
        request,
        active_menu="Documents",
        page_title="My Documents",
        page_subtitle="View, download, and request official documents.",
        documents=build_student_documents(profile, registration),
        requested_documents=my_requests,
    )


def document_available(profile, registration, doc_key):
    """Whether the student may open or download this document."""
    docs = {d["key"]: d for d in build_student_documents(profile, registration)}
    row = docs.get(doc_key)
    if not row:
        return None
    return row


def submit_document_request(request):
    from django.http import JsonResponse
    from .models import StudentDocumentRequest
    from .services import get_enrollment_profile

    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Authentication required."}, status=401)
    if request.method != "POST":
        return JsonResponse({"ok": False, "error": "Invalid request method."}, status=405)

    from .services import registration_is_enrolled

    if not registration_is_enrolled(request.user):
        return JsonResponse(
            {"ok": False, "error": "Document requests are restricted until your enrollment is officially confirmed."},
            status=403,
        )

    doc_name = (request.POST.get("requested_document") or "").strip()
    purpose = (request.POST.get("purpose") or "").strip()

    if not doc_name:
        return JsonResponse({"ok": False, "error": "Please select a document to request."}, status=400)

    profile = get_enrollment_profile(request.user)
    doc_req = StudentDocumentRequest.objects.create(
        user=request.user,
        profile=profile,
        document_name=doc_name,
        purpose=purpose,
        status=StudentDocumentRequest.Status.PENDING,
    )

    # Notify both ends:
    from backend.core.notification_service import create_notification, notify_users, registrar_users
    from backend.core.models import PortalNotification

    student_name = request.user.get_full_name() or request.user.email
    course_name = (profile.selected_program if profile else "") or getattr(request.user, "registration_application", None) and request.user.registration_application.selected_program or "Training Program"
    purpose_desc = f" Purpose: {purpose}." if purpose else ""

    # 1. Notify Registrar end
    notify_users(
        registrar_users(),
        category=PortalNotification.Category.ENROLLMENT_REQUIREMENTS,
        title=f"New Document Request: {doc_name}",
        message=f"{student_name} ({course_name}) requested '{doc_name}'.{purpose_desc}",
        link_url="/dashboard/registrar/document-requests/",
        related_profile_id=profile.pk if profile else None,
    )

    # 2. Notify Student end (confirmation)
    create_notification(
        request.user,
        category=PortalNotification.Category.GENERAL,
        title="Document Request Submitted",
        message=f"Your request for '{doc_name}' has been received by the Registrar's Office and is currently pending review.",
        link_url="/dashboard/student/documents/",
        related_profile_id=profile.pk if profile else None,
    )

    return JsonResponse({
        "ok": True,
        "message": f"Request for {doc_name} submitted successfully.",
        "id": doc_req.id,
    })

