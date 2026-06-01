"""Registrar review of enrollment documents before payment."""

from django.utils import timezone

from .enrollment_requirements import REQUIREMENT_SPECS
from .models import StudentEnrollmentDocument, StudentEnrollmentProfile

REVIEW_PENDING = "pending"
REVIEW_APPROVED = "approved"
REVIEW_REJECTED = "rejected"


def reviewable_document_keys(profile: StudentEnrollmentProfile) -> list[str]:
    if not profile:
        return []
    keys = []
    if profile.photo:
        keys.append("profile_photo")
    uploaded = set(profile.documents.values_list("document_type", flat=True))
    for spec in REQUIREMENT_SPECS:
        if spec["key"] in uploaded:
            keys.append(spec["key"])
    return keys


def get_document_review_status(profile: StudentEnrollmentProfile, document_key: str) -> str:
    if document_key == "profile_photo":
        return profile.photo_registrar_status or REVIEW_PENDING
    doc = profile.documents.filter(document_type=document_key).first()
    if not doc:
        return REVIEW_PENDING
    return doc.registrar_status or REVIEW_PENDING


def all_reviewable_documents_approved(profile: StudentEnrollmentProfile) -> bool:
    keys = reviewable_document_keys(profile)
    if not keys:
        return False
    return all(get_document_review_status(profile, key) == REVIEW_APPROVED for key in keys)


def documents_cleared_for_payment(profile: StudentEnrollmentProfile | None) -> bool:
    return bool(profile and profile.documents_review_released)


def approve_document(profile: StudentEnrollmentProfile, document_key: str):
    from .enrollment_notifications import notify_student_document_approved

    now = timezone.now()
    if document_key == "profile_photo":
        profile.photo_registrar_status = REVIEW_APPROVED
        profile.photo_rejection_reason = ""
        profile.save(
            update_fields=[
                "photo_registrar_status",
                "photo_rejection_reason",
                "updated_at",
            ]
        )
        notify_student_document_approved(profile, document_key)
        return
    doc = profile.documents.filter(document_type=document_key).first()
    if not doc:
        raise ValueError("Document not found.")
    doc.registrar_status = REVIEW_APPROVED
    doc.rejection_reason = ""
    doc.reviewed_at = now
    doc.save(update_fields=["registrar_status", "rejection_reason", "reviewed_at"])
    notify_student_document_approved(profile, document_key)


def reject_document(profile: StudentEnrollmentProfile, document_key: str, reason: str):
    from .enrollment_notifications import notify_student_document_rejected

    reason = (reason or "").strip()
    if not reason:
        raise ValueError("A rejection reason is required.")
    now = timezone.now()
    if document_key == "profile_photo":
        profile.photo_registrar_status = REVIEW_REJECTED
        profile.photo_rejection_reason = reason[:500]
        profile.documents_review_released = False
        profile.save(
            update_fields=[
                "photo_registrar_status",
                "photo_rejection_reason",
                "documents_review_released",
                "updated_at",
            ]
        )
        notify_student_document_rejected(profile, document_key, reason)
        return
    doc = profile.documents.filter(document_type=document_key).first()
    if not doc:
        raise ValueError("Document not found.")
    doc.registrar_status = REVIEW_REJECTED
    doc.rejection_reason = reason[:500]
    doc.reviewed_at = now
    doc.save(update_fields=["registrar_status", "rejection_reason", "reviewed_at"])
    profile.documents_review_released = False
    profile.save(update_fields=["documents_review_released", "updated_at"])
    notify_student_document_rejected(profile, document_key, reason)


def release_document_review(profile: StudentEnrollmentProfile):
    from .enrollment_notifications import notify_student_documents_released

    if not all_reviewable_documents_approved(profile):
        raise ValueError("Approve every document before continuing.")
    profile.documents_review_released = True
    profile.documents_review_released_at = timezone.now()
    profile.save(
        update_fields=["documents_review_released", "documents_review_released_at", "updated_at"]
    )
    notify_student_documents_released(profile)


def reset_document_reviews(profile: StudentEnrollmentProfile):
    """Call when student replaces a file so registrar must review again."""
    if not profile.pk:
        return
    profile.photo_registrar_status = REVIEW_PENDING
    profile.photo_rejection_reason = ""
    profile.documents_review_released = False
    profile.documents_review_released_at = None
    profile.documents.update(
        registrar_status=REVIEW_PENDING,
        rejection_reason="",
        reviewed_at=None,
    )
    profile.save(
        update_fields=[
            "photo_registrar_status",
            "photo_rejection_reason",
            "documents_review_released",
            "documents_review_released_at",
            "updated_at",
        ]
    )
