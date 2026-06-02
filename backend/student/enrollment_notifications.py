"""Enrollment-related portal notifications (student ↔ registrar)."""

from backend.core.models import PortalNotification
from backend.core.notification_service import create_notification, notify_users, registrar_users
from backend.student.enrollment_requirements import REQUIREMENT_SPECS
from backend.student.models import StudentEnrollmentProfile

STUDENT_PENDING_URL = "/dashboard/student/enrollment/pending/"
STUDENT_REQUIREMENTS_URL = "/dashboard/student/enrollment/requirements/"
STUDENT_PAYMENTS_URL = "/dashboard/student/payments/"
REGISTRAR_ENROLLMENT_URL = "/registrar/enrollment/"


def _student_name(profile: StudentEnrollmentProfile) -> str:
    name = f"{profile.first_name} {profile.last_name}".strip()
    return name or profile.email or "Student"


def _document_title(document_key: str) -> str:
    if document_key == "profile_photo":
        return "1×1 Photo (Learner Profile)"
    for spec in REQUIREMENT_SPECS:
        if spec["key"] == document_key:
            return spec["title"]
    return document_key.replace("_", " ").title()


def notify_registrars_requirements_submitted(profile: StudentEnrollmentProfile):
    """Student submitted enrollment documents for registrar review."""
    name = _student_name(profile)
    program = profile.selected_program or "their program"
    notify_users(
        registrar_users(),
        category=PortalNotification.Category.ENROLLMENT_REQUIREMENTS,
        title="New enrollment documents",
        message=f"{name} submitted enrollment requirements for {program}. Review and approve each document.",
        link_url=REGISTRAR_ENROLLMENT_URL,
        related_profile_id=profile.pk,
    )


def notify_student_document_approved(profile: StudentEnrollmentProfile, document_key: str):
    doc_title = _document_title(document_key)
    create_notification(
        profile.user,
        category=PortalNotification.Category.DOCUMENT_APPROVED,
        title="Document approved",
        message=f"Your {doc_title} was approved by the registrar.",
        link_url=STUDENT_PENDING_URL,
        related_profile_id=profile.pk,
    )


def notify_student_document_rejected(
    profile: StudentEnrollmentProfile, document_key: str, reason: str
):
    doc_title = _document_title(document_key)
    reason = (reason or "").strip()
    msg = f"Your {doc_title} was not approved."
    if reason:
        msg += f" Reason: {reason}"
    msg += " Please update your upload in Enrollment."
    create_notification(
        profile.user,
        category=PortalNotification.Category.DOCUMENT_REJECTED,
        title="Document needs correction",
        message=msg,
        link_url=STUDENT_REQUIREMENTS_URL,
        related_profile_id=profile.pk,
    )


def notify_student_documents_released(profile: StudentEnrollmentProfile):
    create_notification(
        profile.user,
        category=PortalNotification.Category.DOCUMENTS_RELEASED,
        title="Documents approved — proceed to payment",
        message=(
            "The registrar approved all of your enrollment documents. "
            "You can now proceed to the payment section."
        ),
        link_url=STUDENT_PAYMENTS_URL,
        related_profile_id=profile.pk,
    )
