"""Document submission indicators — tracking online uploads and physical hard copies."""

from django.utils import timezone

from .enrollment_requirements import (
    REQUIREMENT_SPECS,
    REQUIRED_DOC_KEYS,
    get_requirement_specs,
    is_assessment_only_profile,
)
from .models import StudentEnrollmentDocument, StudentEnrollmentProfile, StudentRegistration

TRAINING_HARD_COPY_SPECS = (
    {
        "key": "birth_certificate",
        "title": "PSA Birth Certificate",
        "hint": "Original / PSA-authenticated copy",
        "required": True,
        "icon_bi": "bi-file-earmark-person",
    },
    {
        "key": "valid_id",
        "title": "Valid Government ID",
        "hint": "Clear photocopy of valid government ID",
        "required": True,
        "icon_bi": "bi-person-vcard",
    },
    {
        "key": "photo_2x2",
        "title": "2x2 ID Photos",
        "hint": "Physical prints, white background (3 pcs)",
        "required": True,
        "icon_bi": "bi-image",
    },
)

ASSESSMENT_HARD_COPY_SPECS = (
    {
        "key": "birth_certificate",
        "title": "PSA/NSO Birth Certificate",
        "hint": "1pc. PSA/NSO Birth Certificate Photocopy",
        "required": True,
        "icon_bi": "bi-file-earmark-person",
    },
    {
        "key": "valid_id",
        "title": "Valid Government ID",
        "hint": "Clear photocopy of valid government ID",
        "required": True,
        "icon_bi": "bi-person-vcard",
    },
    {
        "key": "covid_completion_certificate",
        "title": "Certificate of Completion (CoC)",
        "hint": "Practicing COVID-19 Preventive Measures in the Workplace",
        "required": True,
        "icon_bi": "bi-award",
    },
    {
        "key": "employment_certificate",
        "title": "Certificate of Employment",
        "hint": "1pc. At least 1 year industry experience (optional)",
        "required": False,
        "icon_bi": "bi-briefcase",
    },
    {
        "key": "passport_photo",
        "title": "Passport-size ID Picture",
        "hint": "2pcs. With colored collar and white background (optional)",
        "required": False,
        "icon_bi": "bi-person-badge",
    },
    {
        "key": "assessment_fee_receipt",
        "title": "Assessment Fee Receipt / Slip",
        "hint": "Official receipt / payment stub (optional)",
        "required": False,
        "icon_bi": "bi-receipt",
    },
)

HARD_COPY_SPECS = TRAINING_HARD_COPY_SPECS


def get_hard_copy_specs(profile: StudentEnrollmentProfile | None = None, reg: StudentRegistration | None = None):
    is_assessment = False
    if profile:
        is_assessment = is_assessment_only_profile(profile)
    elif reg:
        is_assessment = getattr(reg, "program_type", "") == "assessment_only"
    return ASSESSMENT_HARD_COPY_SPECS if is_assessment else TRAINING_HARD_COPY_SPECS


def get_document_submission_indicators(
    profile: StudentEnrollmentProfile | None,
    reg: StudentRegistration | None = None,
) -> dict:
    """Return indicators for both online digital uploads and physical hard copies."""
    is_assessment = (profile and is_assessment_only_profile(profile)) or (
        reg and getattr(reg, "program_type", "") == "assessment_only"
    )
    req_specs = get_requirement_specs(profile, is_assessment_only=is_assessment)
    required_keys = {spec["key"] for spec in req_specs if spec["required"]}
    total_required = len(required_keys)

    # 1. Digital uploads status
    uploaded_keys = set()

    if profile:
        doc_types = set(
            profile.documents.filter(file__isnull=False)
            .exclude(file="")
            .values_list("document_type", flat=True)
        )
        uploaded_keys.update(doc_types)

    req_uploaded_count = len(uploaded_keys.intersection(required_keys))
    if profile and profile.requirements_submitted:
        # If requirements were formally submitted, ensure count reaches required
        req_uploaded_count = max(req_uploaded_count, total_required)

    if req_uploaded_count >= total_required and total_required > 0:
        digital_status = "uploaded"
        digital_label = f"Uploaded ({req_uploaded_count}/{total_required})"
        digital_badge_class = "registrar-doc-badge--uploaded"
        is_digital_uploaded = True
    elif req_uploaded_count > 0:
        digital_status = "partial"
        digital_label = f"Incomplete ({req_uploaded_count}/{total_required})"
        digital_badge_class = "registrar-doc-badge--partial"
        is_digital_uploaded = False
    else:
        digital_status = "pending"
        digital_label = f"Pending ({req_uploaded_count}/{total_required})"
        digital_badge_class = "registrar-doc-badge--pending"
        is_digital_uploaded = False

    # Breakdown of digital documents
    digital_docs = []
    for spec in req_specs:
        key = spec["key"]
        has_file = key in uploaded_keys
        digital_docs.append(
            {
                "key": key,
                "title": spec["title"],
                "required": spec["required"],
                "uploaded": has_file,
            }
        )

    # 2. Hard copies status
    is_hard_submitted = False
    submitted_at_dt = None
    received_by_name = ""
    notes = ""
    saved_doc_map = {}

    if profile:
        is_hard_submitted = bool(profile.hard_copies_submitted)
        submitted_at_dt = profile.hard_copies_submitted_at
        notes = profile.hard_copies_notes or ""
        saved_doc_map = profile.hard_copy_documents or {}
        if profile.hard_copies_received_by:
            received_by_name = (
                profile.hard_copies_received_by.get_full_name()
                or profile.hard_copies_received_by.username
            )
    elif reg:
        is_hard_submitted = bool(reg.hard_copies_submitted)
        submitted_at_dt = reg.hard_copies_submitted_at

    if is_hard_submitted:
        hard_copy_status = "submitted"
        hard_copy_label = "Hard Copies: Submitted"
        hard_copy_badge_class = "registrar-doc-badge--hard-submitted"
    else:
        hard_copy_status = "pending"
        hard_copy_label = "Hard Copies: Pending"
        hard_copy_badge_class = "registrar-doc-badge--hard-pending"

    submitted_at_display = (
        timezone.localtime(submitted_at_dt).strftime("%b %d, %Y")
        if submitted_at_dt
        else ""
    )

    # Hard copy item breakdown
    hard_copy_specs = get_hard_copy_specs(profile, reg)
    hard_copy_items = []
    for spec in hard_copy_specs:
        key = spec["key"]
        # Default received state: if whole hard copy submitted and not explicitly false, or true in dict
        if is_hard_submitted:
            received = saved_doc_map.get(key, True if spec["required"] else False)
        else:
            received = bool(saved_doc_map.get(key, False))
        hard_copy_items.append(
            {
                "key": key,
                "title": spec["title"],
                "hint": spec["hint"],
                "required": spec["required"],
                "icon_bi": spec["icon_bi"],
                "received": bool(received),
            }
        )

    return {
        "digital": {
            "status": digital_status,
            "label": digital_label,
            "badgeClass": digital_badge_class,
            "isUploaded": is_digital_uploaded,
            "uploadedCount": req_uploaded_count,
            "requiredCount": total_required,
            "documents": digital_docs,
        },
        "hardCopy": {
            "status": hard_copy_status,
            "label": hard_copy_label,
            "badgeClass": hard_copy_badge_class,
            "isSubmitted": is_hard_submitted,
            "submittedAt": submitted_at_display,
            "receivedBy": received_by_name,
            "notes": notes,
            "items": hard_copy_items,
        },
    }


def update_hard_copies_submission(
    profile: StudentEnrollmentProfile | None,
    reg: StudentRegistration | None,
    submitted: bool,
    *,
    notes: str = "",
    documents_map: dict | None = None,
    received_by=None,
):
    """Mark physical hard copies as received or pending."""
    hard_copy_specs = get_hard_copy_specs(profile, reg)
    if documents_map is not None:
        required_keys = {spec["key"] for spec in hard_copy_specs if spec["required"]}
        submitted = required_keys.issubset({k for k, v in documents_map.items() if v})

    now = timezone.now() if submitted else None

    if profile:
        profile.hard_copies_submitted = submitted
        profile.hard_copies_submitted_at = now
        profile.hard_copies_notes = (notes or "").strip()[:500]
        if received_by and submitted:
            profile.hard_copies_received_by = received_by
        elif not submitted:
            profile.hard_copies_received_by = None

        if documents_map is not None:
            profile.hard_copy_documents = {
                k: bool(v) for k, v in documents_map.items()
            }
        elif submitted:
            # Mark all required specs as received by default
            profile.hard_copy_documents = {
                spec["key"]: True for spec in hard_copy_specs if spec["required"]
            }
        else:
            profile.hard_copy_documents = {}

        profile.save(
            update_fields=[
                "hard_copies_submitted",
                "hard_copies_submitted_at",
                "hard_copies_received_by",
                "hard_copies_notes",
                "hard_copy_documents",
                "updated_at",
            ]
        )

        # Sync matching documents in StudentEnrollmentDocument
        for key, rec in (profile.hard_copy_documents or {}).items():
            profile.documents.filter(document_type=key).update(
                hard_copy_received=rec,
                hard_copy_received_at=now if rec else None,
            )

        if profile.registration_id and profile.registration and profile.registration != reg:
            profile.registration.hard_copies_submitted = submitted
            profile.registration.hard_copies_submitted_at = now
            profile.registration.save(
                update_fields=["hard_copies_submitted", "hard_copies_submitted_at"]
            )

    if reg:
        reg.hard_copies_submitted = submitted
        reg.hard_copies_submitted_at = now
        reg.save(update_fields=["hard_copies_submitted", "hard_copies_submitted_at"])
