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

    # 1. Notify Registrar end
    notify_users(
        registrar_users(),
        category=PortalNotification.Category.ENROLLMENT_REQUIREMENTS,
        title="New enrollment documents",
        message=f"{name} submitted enrollment requirements for {program}. Review and approve each document.",
        link_url=REGISTRAR_ENROLLMENT_URL,
        related_profile_id=profile.pk,
    )

    # 2. Notify Student end (confirmation)
    if profile.user_id:
        create_notification(
            profile.user,
            category=PortalNotification.Category.ENROLLMENT_REQUIREMENTS,
            title="Enrollment documents submitted",
            message=f"Your enrollment documents for {program} were submitted and are pending review by the Registrar.",
            link_url=STUDENT_PENDING_URL,
            related_profile_id=profile.pk,
        )


def notify_student_document_approved(profile: StudentEnrollmentProfile, document_key: str):
    doc_title = _document_title(document_key)
    name = _student_name(profile)

    # 1. Notify Student end
    create_notification(
        profile.user,
        category=PortalNotification.Category.DOCUMENT_APPROVED,
        title="Document approved",
        message=f"Your {doc_title} was approved by the registrar.",
        link_url=STUDENT_PENDING_URL,
        related_profile_id=profile.pk,
    )

    # 2. Notify Registrar end
    notify_users(
        registrar_users(),
        category=PortalNotification.Category.DOCUMENT_APPROVED,
        title=f"Document Approved: {doc_title}",
        message=f"{name}'s {doc_title} has been approved.",
        link_url=REGISTRAR_ENROLLMENT_URL,
        related_profile_id=profile.pk,
    )


def notify_student_document_rejected(
    profile: StudentEnrollmentProfile, document_key: str, reason: str
):
    doc_title = _document_title(document_key)
    name = _student_name(profile)
    reason = (reason or "").strip()
    msg = f"Your {doc_title} was not approved."
    if reason:
        msg += f" Reason: {reason}"
    msg += " Please update your upload in Enrollment."

    # 1. Notify Student end
    create_notification(
        profile.user,
        category=PortalNotification.Category.DOCUMENT_REJECTED,
        title="Document needs correction",
        message=msg,
        link_url=STUDENT_REQUIREMENTS_URL,
        related_profile_id=profile.pk,
    )

    # 2. Notify Registrar end
    reg_msg = f"{name}'s {doc_title} was returned for correction."
    if reason:
        reg_msg += f" Reason: {reason}"
    notify_users(
        registrar_users(),
        category=PortalNotification.Category.DOCUMENT_REJECTED,
        title=f"Document Rejected: {doc_title}",
        message=reg_msg,
        link_url=REGISTRAR_ENROLLMENT_URL,
        related_profile_id=profile.pk,
    )


def notify_student_documents_released(profile: StudentEnrollmentProfile):
    name = _student_name(profile)

    # 1. Notify Student end
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

    # 2. Notify Registrar end
    notify_users(
        registrar_users(),
        category=PortalNotification.Category.DOCUMENTS_RELEASED,
        title=f"All Documents Approved: {name}",
        message=f"All enrollment documents for {name} have been approved and released to payment.",
        link_url=REGISTRAR_ENROLLMENT_URL,
        related_profile_id=profile.pk,
    )


def notify_enrollment_approved(profile: StudentEnrollmentProfile | None, reg=None):
    """Notify student and registrar when an enrollment application is officially approved."""
    name = (f"{reg.first_name} {reg.last_name}").strip() if reg else (_student_name(profile) if profile else "Student")
    program = (reg.selected_program if reg else "") or (profile.selected_program if profile else "") or "Training Program"
    student_user = profile.user if profile else getattr(reg, "user", None)

    # 1. Notify Student end
    if student_user:
        create_notification(
            student_user,
            category=PortalNotification.Category.DOCUMENT_APPROVED,
            title="Enrollment Approved!",
            message=f"Congratulations! Your enrollment application for {program} has been approved by the Registrar.",
            link_url=STUDENT_PENDING_URL,
            related_profile_id=profile.pk if profile else None,
        )

    # 2. Notify Registrar end
    notify_users(
        registrar_users(),
        category=PortalNotification.Category.DOCUMENT_APPROVED,
        title=f"Enrollment Approved: {name}",
        message=f"Enrollment application for {name} ({program}) has been approved.",
        link_url=REGISTRAR_ENROLLMENT_URL,
        related_profile_id=profile.pk if profile else None,
    )


def notify_enrollment_rejected(profile: StudentEnrollmentProfile | None, reg=None):
    """Notify student and registrar when an enrollment application is rejected."""
    name = (f"{reg.first_name} {reg.last_name}").strip() if reg else (_student_name(profile) if profile else "Student")
    program = (reg.selected_program if reg else "") or (profile.selected_program if profile else "") or "Training Program"
    student_user = profile.user if profile else getattr(reg, "user", None)

    # 1. Notify Student end
    if student_user:
        create_notification(
            student_user,
            category=PortalNotification.Category.DOCUMENT_REJECTED,
            title="Enrollment Application Status",
            message=f"Your enrollment application for {program} was not approved.",
            link_url=STUDENT_PENDING_URL,
            related_profile_id=profile.pk if profile else None,
        )

    # 2. Notify Registrar end
    notify_users(
        registrar_users(),
        category=PortalNotification.Category.DOCUMENT_REJECTED,
        title=f"Enrollment Rejected: {name}",
        message=f"Enrollment application for {name} ({program}) was rejected.",
        link_url=REGISTRAR_ENROLLMENT_URL,
        related_profile_id=profile.pk if profile else None,
    )
