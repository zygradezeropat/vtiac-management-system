
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

    profile = get_enrollment_profile(request.user)
    registration = getattr(request.user, "registration_application", None)

    return _student_portal_base(
        request,
        active_menu="Documents",
        page_title="My Documents",
        page_subtitle="View and download your documents.",
        documents=build_student_documents(profile, registration),
    )


def document_available(profile, registration, doc_key):
    """Whether the student may open or download this document."""
    docs = {d["key"]: d for d in build_student_documents(profile, registration)}
    row = docs.get(doc_key)
    if not row:
        return None
    return row
