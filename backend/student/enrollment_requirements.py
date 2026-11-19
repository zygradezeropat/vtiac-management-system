"""Step 2 — enrollment document uploads."""

from django.utils import timezone

from .models import StudentEnrollmentDocument, StudentEnrollmentProfile

MAX_DOCUMENT_BYTES = 100 * 1024 * 1024  # Generous 100MB limit
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


def is_assessment_only_profile(profile):
    """Return True if profile belongs to an Assessment-Only applicant."""
    if not profile:
        return False
    if getattr(profile, "program_type", "") == "assessment_only":
        return True
    if (
        hasattr(profile, "registration")
        and profile.registration
        and getattr(profile.registration, "program_type", "") == "assessment_only"
    ):
        return True
    user = getattr(profile, "user", None)
    if user and getattr(user, "is_authenticated", False):
        reg = getattr(user, "registration_application", None)
        if reg and getattr(reg, "program_type", "") == "assessment_only":
            return True
    return False


TRAINING_REQUIREMENT_SPECS = (
    {
        "key": StudentEnrollmentDocument.DocumentType.BIRTH_CERTIFICATE,
        "title": "Birth Certificate",
        "hint": "PSA/NSO issued copy",
        "required": True,
        "requires_hard_copy": True,
        "icon_bi": "bi-file-earmark-text",
        "has_id_type": False,
    },
    {
        "key": StudentEnrollmentDocument.DocumentType.VALID_ID,
        "title": "Valid ID",
        "hint": "Government-issued ID",
        "required": True,
        "requires_hard_copy": True,
        "icon_bi": "bi-person-vcard",
        "has_id_type": True,
    },
    {
        "key": StudentEnrollmentDocument.DocumentType.GOOD_MORAL,
        "title": "Certificate of Good Moral",
        "hint": "From previous school or barangay (optional)",
        "required": False,
        "requires_hard_copy": False,
        "icon_bi": "bi-award",
        "has_id_type": False,
    },
    {
        "key": StudentEnrollmentDocument.DocumentType.TRANSCRIPT,
        "title": "Transcript of Records",
        "hint": "Latest TOR or Form 138 (optional)",
        "required": False,
        "requires_hard_copy": False,
        "icon_bi": "bi-journal-text",
        "has_id_type": False,
    },
)

ASSESSMENT_REQUIREMENT_SPECS = (
    {
        "key": StudentEnrollmentDocument.DocumentType.BIRTH_CERTIFICATE,
        "title": "PSA/NSO Birth Certificate",
        "hint": "1pc. PSA/NSO Birth Certificate Photocopy",
        "required": True,
        "requires_hard_copy": True,
        "icon_bi": "bi-file-earmark-person",
        "has_id_type": False,
    },
    {
        "key": StudentEnrollmentDocument.DocumentType.VALID_ID,
        "title": "Valid ID",
        "hint": "Government-issued ID",
        "required": True,
        "requires_hard_copy": True,
        "icon_bi": "bi-person-vcard",
        "has_id_type": True,
    },
    {
        "key": StudentEnrollmentDocument.DocumentType.COVID_COMPLETION_CERTIFICATE,
        "title": "Certificate of Completion (CoC)",
        "hint": "Practicing COVID-19 Preventive Measures in the Workplace",
        "required": True,
        "requires_hard_copy": True,
        "icon_bi": "bi-award",
        "has_id_type": False,
    },
    {
        "key": StudentEnrollmentDocument.DocumentType.EMPLOYMENT_CERTIFICATE,
        "title": "Certificate of Employment",
        "hint": "1pc. Certificate of Employment (at least 1 year industry experience - optional)",
        "required": False,
        "requires_hard_copy": False,
        "icon_bi": "bi-briefcase",
        "has_id_type": False,
    },
    {
        "key": StudentEnrollmentDocument.DocumentType.PASSPORT_PHOTO,
        "title": "Passport-size ID Picture",
        "hint": "2pcs. Passport-size ID Picture with colored collar and white background (optional)",
        "required": False,
        "requires_hard_copy": False,
        "icon_bi": "bi-person-badge",
        "has_id_type": False,
    },
    {
        "key": StudentEnrollmentDocument.DocumentType.ASSESSMENT_FEE_RECEIPT,
        "title": "Assessment Fee Official Receipt",
        "hint": "Assessment Fee (varies for each qualification) — upload receipt or payment proof (optional)",
        "required": False,
        "requires_hard_copy": False,
        "icon_bi": "bi-receipt",
        "has_id_type": False,
    },
)

REQUIREMENT_SPECS = TRAINING_REQUIREMENT_SPECS


def get_requirement_specs(profile=None, *, is_assessment_only=False):
    if is_assessment_only or is_assessment_only_profile(profile):
        return ASSESSMENT_REQUIREMENT_SPECS
    return TRAINING_REQUIREMENT_SPECS


def get_required_doc_keys(profile=None, *, is_assessment_only=False):
    specs = get_requirement_specs(profile=profile, is_assessment_only=is_assessment_only)
    return {spec["key"] for spec in specs if spec["required"]}


VALID_DOC_KEYS = (
    {spec["key"] for spec in TRAINING_REQUIREMENT_SPECS}
    | {spec["key"] for spec in ASSESSMENT_REQUIREMENT_SPECS}
    | {StudentEnrollmentDocument.DocumentType.PHOTO_2X2}
)
REQUIRED_DOC_KEYS = {spec["key"] for spec in TRAINING_REQUIREMENT_SPECS if spec["required"]}


def _validate_upload_file(uploaded_file):
    if not uploaded_file:
        return "No file selected."
    content_type = (getattr(uploaded_file, "content_type", "") or "").lower()
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        return "File must be PDF, JPEG, or PNG format."
    return None


def build_requirements_rows(profile, *, is_assessment_only=None):
    docs = {d.document_type: d for d in profile.documents.all()} if profile else {}
    hard_copy_docs = profile.hard_copy_documents if profile and profile.hard_copy_documents else {}
    is_hard_submitted = bool(profile and profile.hard_copies_submitted)
    if is_assessment_only is None:
        is_assessment_only = is_assessment_only_profile(profile)
    specs = get_requirement_specs(profile, is_assessment_only=is_assessment_only)
    rows = []
    for spec in specs:
        doc = docs.get(spec["key"])
        if doc and doc.file:
            filename = doc.original_filename or doc.file.name.split("/")[-1]
            file_url = doc.file.url
            uploaded = True
        else:
            filename = ""
            file_url = ""
            uploaded = False
        is_approved = bool(
            doc
            and doc.registrar_status
            == StudentEnrollmentProfile.PhotoRegistrarStatus.APPROVED
        )

        requires_hard_copy = spec.get("requires_hard_copy", spec["required"])
        if not requires_hard_copy:
            hard_copy_received = False
        elif doc and doc.hard_copy_received:
            hard_copy_received = True
        elif spec["key"] in hard_copy_docs:
            hard_copy_received = bool(hard_copy_docs[spec["key"]])
        elif is_hard_submitted and spec["required"]:
            hard_copy_received = True
        else:
            hard_copy_received = False

        rows.append(
            {
                **spec,
                "requires_hard_copy": requires_hard_copy,
                "uploaded": uploaded,
                "filename": filename,
                "file_url": file_url,
                "id_type": doc.id_type if doc else "",
                "registrar_status": doc.registrar_status if doc else "",
                "rejection_reason": doc.rejection_reason if doc else "",
                "is_rejected": bool(
                    doc
                    and doc.registrar_status
                    == StudentEnrollmentProfile.PhotoRegistrarStatus.REJECTED
                ),
                "is_approved": is_approved,
                "hard_copy_received": hard_copy_received,
            }
        )
    return rows


def save_enrollment_document(profile, document_type, uploaded_file, id_type="", *, records_mode=False):
    if document_type not in VALID_DOC_KEYS:
        raise ValueError("Invalid document type.")

    error = _validate_upload_file(uploaded_file)
    if error:
        raise ValueError(error)

    if document_type == StudentEnrollmentDocument.DocumentType.VALID_ID:
        valid_ids = {c[0] for c in ID_TYPE_CHOICES}
        if id_type not in valid_ids:
            raise ValueError("Please select a valid ID type.")

    existing = profile.documents.filter(document_type=document_type).first()
    if (
        not records_mode
        and existing
        and existing.registrar_status
        == StudentEnrollmentProfile.PhotoRegistrarStatus.APPROVED
    ):
        raise ValueError("This document was already approved and cannot be changed.")

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


def remove_enrollment_document(profile, document_type):
    if document_type not in VALID_DOC_KEYS:
        raise ValueError("Invalid document type.")

    doc = profile.documents.filter(document_type=document_type).first()
    if not doc or not doc.file:
        raise ValueError("No uploaded file found for this document.")
    if doc.registrar_status == StudentEnrollmentProfile.PhotoRegistrarStatus.APPROVED:
        raise ValueError("Approved documents cannot be removed.")

    if doc.file:
        doc.file.delete(save=False)
    doc.file = ""
    doc.original_filename = ""
    doc.registrar_status = StudentEnrollmentProfile.PhotoRegistrarStatus.PENDING
    doc.rejection_reason = ""
    doc.reviewed_at = None

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
        ]
    )
    return doc


def remove_rejected_enrollment_document(profile, document_type):
    return remove_enrollment_document(profile, document_type)


def validate_requirements_complete(profile):
    """Return list of error messages if required documents are missing."""
    errors = []
    specs = get_requirement_specs(profile)
    required_keys = {s["key"] for s in specs if s["required"]}
    uploaded = set(
        profile.documents.filter(file__isnull=False)
        .exclude(file="")
        .values_list("document_type", flat=True)
    )
    for spec in specs:
        if spec["required"] and spec["key"] not in uploaded:
            errors.append(f"{spec['title']} is required.")

    if StudentEnrollmentDocument.DocumentType.VALID_ID in required_keys:
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
    is_hard_submitted = bool(
        profile.hard_copies_submitted
        or (hasattr(profile, "registration") and profile.registration and profile.registration.hard_copies_submitted)
        or (profile.user_id and getattr(profile.user, "registration_application", None) and profile.user.registration_application.hard_copies_submitted)
    )
    from .models import StudentRegistration

    reg = getattr(profile, "registration", None)
    if not reg and profile.user_id:
        reg = getattr(profile.user, "registration_application", None)

    if reg and reg.status == StudentRegistration.Status.APPROVED:
        # 100% when officially enrolled AND physical hard copies are passed; 95% if hard copies are still pending
        return 100 if is_hard_submitted else 95

    if profile.requirements_submitted:
        from .payment_records import profile_has_payment

        if profile_has_payment(profile):
            return 95 if is_hard_submitted else 90
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

    from backend.student.document_submission import get_document_submission_indicators

    profile = get_enrollment_profile(request.user)
    reg = getattr(request.user, "registration_application", None)
    doc_indicators = get_document_submission_indicators(profile, reg)
    is_assessment_only = is_assessment_only_program(
        enrollment_program_type_for_user(request.user)
    )
    progress = enrollment_progress_percent(profile)

    return _student_portal_base(
        request,
        active_menu="Assessment" if is_assessment_only else "Enrollment",
        page_title=(
            "Assessment Application Process"
            if is_assessment_only
            else "Registration Process"
        ),
        page_subtitle=(
            "Complete your competency assessment application step by step"
            if is_assessment_only
            else "Complete your registration step by step"
        ),
        progress_percent=progress,
        enrollment_step_label="Step 2: Upload Requirements",
        enrollment_step_icon="bi-cloud-upload",
        requirements_rows=(
            build_requirements_rows(profile, is_assessment_only=is_assessment_only)
            if profile
            else []
        ),
        id_type_choices=ID_TYPE_CHOICES,
        requirements_submitted=bool(profile and profile.requirements_submitted),
        can_edit_requirements=can_edit_enrollment_application(request.user),
        enrollment_under_review=enrollment_pending_review(request.user),
        records_mode=False,
        requirements_post_url_name="student_enrollment_requirements",
        is_assessment_only=is_assessment_only,
        doc_indicators=doc_indicators,
        hard_copies_submitted=doc_indicators["hardCopy"]["isSubmitted"],
        hard_copies_submitted_at=doc_indicators["hardCopy"]["submittedAt"],
        digital_records_uploaded=doc_indicators["digital"]["isUploaded"],
        digital_records_label=doc_indicators["digital"]["label"],
        digital_uploaded_count=doc_indicators["digital"]["uploadedCount"],
        digital_required_count=doc_indicators["digital"]["requiredCount"],
    )


def dashboard_requirements_from_profile(profile):
    """Requirements checklist for the student dashboard."""
    is_assessment = is_assessment_only_profile(profile)
    specs = get_requirement_specs(profile, is_assessment_only=is_assessment)
    if not profile:
        return [
            {
                "label": spec["title"] if spec["required"] else f"{spec['title']} (optional)",
                "done": False,
                "optional": not spec["required"],
            }
            for spec in specs
        ]

    uploaded = set(
        profile.documents.filter(file__isnull=False)
        .exclude(file="")
        .values_list("document_type", flat=True)
    )
    rows = []
    for spec in specs:
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
