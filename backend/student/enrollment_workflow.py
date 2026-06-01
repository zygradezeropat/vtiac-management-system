"""
Shared student enrollment pipeline — mirrors staff enrollment stages.

Used by the student dashboard stepper and registrar-facing flows.
"""

from .document_review import documents_cleared_for_payment
from .models import StudentEnrollmentProfile, StudentRegistration

# Order matches the student portal + registrar enrollment workflow.
ENROLLMENT_PIPELINE = (
    {
        "key": "profile",
        "label": "Complete Personal Info",
        "staff_label": "Learner profile (TESDA)",
        "icon": "bi-person-vcard",
    },
    {
        "key": "requirements",
        "label": "Upload Requirements",
        "staff_label": "Document requirements",
        "icon": "bi-cloud-upload",
    },
    {
        "key": "payment",
        "label": "Payment",
        "staff_label": "Payment verification",
        "icon": "bi-credit-card",
    },
    {
        "key": "review",
        "label": "Pending Approval",
        "staff_label": "Registrar enrollment approval",
        "icon": "bi-hourglass-split",
    },
    {
        "key": "enrolled",
        "label": "Approved & Enrolled",
        "staff_label": "Enrolled",
        "icon": "bi-patch-check-fill",
    },
)


def _pipeline_index(key):
    for i, step in enumerate(ENROLLMENT_PIPELINE):
        if step["key"] == key:
            return i
    return 0


def _active_pipeline_key(profile, registration):
    """Which pipeline step the student is currently on."""
    if not profile or not profile.profile_step_completed:
        return "profile"
    if not profile.requirements_submitted:
        return "requirements"
    if profile.requirements_submitted and not documents_cleared_for_payment(profile):
        return "requirements"
    if registration and registration.status == StudentRegistration.Status.APPROVED:
        return "enrolled"
    if registration and registration.status == StudentRegistration.Status.REJECTED:
        return "review"
    from .payment_records import profile_has_payment

    if profile_has_payment(profile):
        return "review"
    # Requirements submitted: payment is the student action; registrar review follows.
    return "payment"


def build_enrollment_steps_timeline(profile, registration=None):
    """
    Build step rows for the dashboard checklist.

    Each item: label, status (done|current|pending), icon class suffix.
    """
    active_key = _active_pipeline_key(profile, registration)
    active_idx = _pipeline_index(active_key)
    reg_status = registration.status if registration else None

    steps = []
    for idx, spec in enumerate(ENROLLMENT_PIPELINE):
        if reg_status == StudentRegistration.Status.APPROVED:
            status = "done"
        elif idx < active_idx:
            status = "done"
        elif idx == active_idx:
            status = "current"
        else:
            status = "pending"

        if spec["key"] == "enrolled" and reg_status == StudentRegistration.Status.REJECTED:
            status = "pending"

        steps.append(
            {
                "key": spec["key"],
                "label": spec["label"],
                "staff_label": spec["staff_label"],
                "status": status,
                "icon": spec["icon"],
            }
        )
    return steps


def application_status_label(profile, registration=None):
    """Human-readable status aligned with the active pipeline step."""
    key = _active_pipeline_key(profile, registration)
    if (
        key == "requirements"
        and profile
        and profile.requirements_submitted
        and not documents_cleared_for_payment(profile)
    ):
        return "Awaiting document approval"
    labels = {
        "profile": "Complete your learner profile",
        "requirements": "Upload required documents",
        "payment": "Proceed with payment",
        "review": "Pending registrar approval",
        "enrolled": "Approved & Enrolled",
    }
    if registration and registration.status == StudentRegistration.Status.REJECTED:
        return "Application not approved"
    return labels.get(key, "In Progress")
