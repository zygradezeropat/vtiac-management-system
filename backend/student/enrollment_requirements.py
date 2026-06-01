"""Step 2 — enrollment document uploads."""

from django.utils import timezone

from .models import StudentEnrollmentDocument, StudentEnrollmentProfile

MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
ALLOWED_CONTENT_TYPES = frozenset(
    {"application/pdf", "image/jpeg", "image/png", "image/jpg"}
)

ID_TYPE_CHOICES = (
    ("philsys", "PhilSys ID (National ID)"),
    ("drivers_license", "Driver's License"),
    ("passport", "Passport"),
    ("umid", "UMID"),
    ("voters_id", "Voter's ID"),
    ("sss_id", "SSS ID"),
    ("prc_id", "PRC ID"),
    ("postal_id", "Postal ID"),
    ("school_id", "School ID"),
)

REQUIREMENT_SPECS = (
    {
        "key": StudentEnrollmentDocument.DocumentType.BIRTH_CERTIFICATE,
        "title": "Birth Certificate",
        "hint": "PSA/NSO issued copy",
        "required": True,
        "icon_bi": "bi-file-earmark-text",
        "has_id_type": False,
    },
    {
        "key": StudentEnrollmentDocument.DocumentType.VALID_ID,
        "title": "Valid ID",
        "hint": "Government-issued ID",
        "required": True,
        "icon_bi": "bi-person-vcard",
        "has_id_type": True,
    },
    {
        "key": StudentEnrollmentDocument.DocumentType.PHOTO_2X2,
        "title": "2x2 Photo",
        "hint": "Recent photo, white background",
        "required": True,
        "icon_bi": "bi-image",
        "has_id_type": False,
    },
    {
        "key": StudentEnrollmentDocument.DocumentType.GOOD_MORAL,
        "title": "Certificate of Good Moral",
        "hint": "From previous school or barangay (optional)",
        "required": False,
        "icon_bi": "bi-award",
        "has_id_type": False,
    },
    {
        "key": StudentEnrollmentDocument.DocumentType.TRANSCRIPT,
        "title": "Transcript of Records",
        "hint": "Latest TOR or Form 138 (optional)",
        "required": False,
        "icon_bi": "bi-journal-text",
        "has_id_type": False,
    },
)

VALID_DOC_KEYS = {spec["key"] for spec in REQUIREMENT_SPECS}
REQUIRED_DOC_KEYS = {spec["key"] for spec in REQUIREMENT_SPECS if spec["required"]}


def _validate_upload_file(uploaded_file):
    if not uploaded_file:
        return "No file selected."
    if uploaded_file.size > MAX_DOCUMENT_BYTES:
        return "File must be 5MB or smaller."
    content_type = (getattr(uploaded_file, "content_type", "") or "").lower()
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        return "File must be PDF, JPEG, or PNG format."
    return None


def build_requirements_rows(profile):
    docs = {d.document_type: d for d in profile.documents.all()}
    rows = []
    for spec in REQUIREMENT_SPECS:
        doc = docs.get(spec["key"])
        if doc and doc.file:
            filename = doc.original_filename or doc.file.name.split("/")[-1]
            file_url = doc.file.url
            uploaded = True
        else:
            filename = ""
            file_url = ""
            uploaded = False
        rows.append(
            {
                **spec,
                "uploaded": uploaded,
                "filename": filename,
                "file_url": file_url,
                "id_type": doc.id_type if doc else "",
            }
        )
    return rows


def save_enrollment_document(profile, document_type, uploaded_file, id_type=""):
    if document_type not in VALID_DOC_KEYS:
        raise ValueError("Invalid document type.")

    error = _validate_upload_file(uploaded_file)
    if error:
        raise ValueError(error)

    if document_type == StudentEnrollmentDocument.DocumentType.VALID_ID:
        valid_ids = {c[0] for c in ID_TYPE_CHOICES}
        if id_type not in valid_ids:
            raise ValueError("Please select a valid ID type.")

    doc, _created = StudentEnrollmentDocument.objects.get_or_create(
        profile=profile,
        document_type=document_type,
        defaults={"id_type": id_type or ""},
    )
    if doc.file:
        doc.file.delete(save=False)
    doc.file = uploaded_file
    doc.original_filename = getattr(uploaded_file, "name", "") or ""
    doc.registrar_status = StudentEnrollmentProfile.PhotoRegistrarStatus.PENDING
    doc.rejection_reason = ""
    doc.reviewed_at = None
    if document_type == StudentEnrollmentDocument.DocumentType.VALID_ID:
        doc.id_type = id_type
    profile.documents_review_released = False
    profile.documents_review_released_at = None
    profile.save(
        update_fields=["documents_review_released", "documents_review_released_at", "updated_at"]
    )
    doc.save(
        update_fields=[
            "file",
            "original_filename",
            "registrar_status",
            "rejection_reason",
            "reviewed_at",
            "id_type",
        ]
    )
    return doc


def validate_requirements_complete(profile):
    """Return list of error messages if required documents are missing."""
    errors = []
    uploaded = set(profile.documents.values_list("document_type", flat=True))
    for key in REQUIRED_DOC_KEYS:
        if key not in uploaded:
            spec = next(s for s in REQUIREMENT_SPECS if s["key"] == key)
            errors.append(f"{spec['title']} is required.")

    valid_id = profile.documents.filter(
        document_type=StudentEnrollmentDocument.DocumentType.VALID_ID
    ).first()
    if valid_id and not valid_id.id_type:
        errors.append("ID Type is required for Valid ID.")

    return errors


def submit_enrollment_requirements(profile):
    errors = validate_requirements_complete(profile)
    if errors:
        return errors

    profile.requirements_submitted = True
    profile.requirements_submitted_at = timezone.now()
    profile.save(update_fields=["requirements_submitted", "requirements_submitted_at", "updated_at"])
    from .enrollment_notifications import notify_registrars_requirements_submitted

    notify_registrars_requirements_submitted(profile)
    return []


def enrollment_progress_percent(profile):
    if not profile:
        return 25
    if profile.registration_id and profile.registration:
        from .models import StudentRegistration

        if profile.registration.status == StudentRegistration.Status.APPROVED:
            return 100
    if profile.requirements_submitted:
        from .payment_records import profile_has_payment

        if profile_has_payment(profile):
            return 90
        return 75
    if profile.profile_step_completed:
        return 50
    return 25


def student_enrollment_requirements_context(request):
    from .services import (
        _student_portal_base,
        can_edit_enrollment_application,
        enrollment_pending_review,
        enrollment_program_type_for_user,
        get_enrollment_profile,
        is_assessment_only_program,
    )

    profile = get_enrollment_profile(request.user)
    progress = enrollment_progress_percent(profile)

    return _student_portal_base(
        request,
        active_menu="Enrollment",
        page_title="Enrollment Process",
        page_subtitle="Complete your enrollment step by step",
        progress_percent=progress,
        enrollment_step_label="Step 2: Upload Requirements",
        enrollment_step_icon="bi-cloud-upload",
        requirements_rows=build_requirements_rows(profile) if profile else [],
        id_type_choices=ID_TYPE_CHOICES,
        requirements_submitted=bool(profile and profile.requirements_submitted),
        can_edit_requirements=can_edit_enrollment_application(request.user),
        enrollment_under_review=enrollment_pending_review(request.user),
        is_assessment_only=is_assessment_only_program(
            enrollment_program_type_for_user(request.user)
        ),
    )


def dashboard_requirements_from_profile(profile):
    """Requirements checklist for the student dashboard."""
    if not profile:
        return [
            {"label": "Birth Certificate", "done": False, "optional": False},
            {"label": "Valid ID", "done": False, "optional": False},
            {"label": "2x2 Photo", "done": False, "optional": False},
            {"label": "Good Moral Certificate (optional)", "done": False, "optional": True},
            {"label": "Transcript of Records (optional)", "done": False, "optional": True},
        ]

    uploaded = set(profile.documents.values_list("document_type", flat=True))
    rows = []
    for spec in REQUIREMENT_SPECS:
        label = spec["title"]
        if not spec["required"]:
            label = f"{label} (optional)"
        rows.append(
            {
                "label": label,
                "done": spec["key"] in uploaded,
                "optional": not spec["required"],
            }
        )
    return rows
