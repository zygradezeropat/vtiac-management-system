"""Approved students with scholarship data for registrar scholarship matching."""

from backend.registrar.pending_enrollment import _profile_for_registration
from backend.student.models import StudentRegistration
from backend.student.services import SCHOLARSHIP_TYPE_CHOICES

_SCHOLARSHIP_LABELS = dict(SCHOLARSHIP_TYPE_CHOICES)


def scholarship_student_registry() -> list[dict]:
    rows = []
    for reg in StudentRegistration.objects.filter(
        status=StudentRegistration.Status.APPROVED,
    ).order_by("last_name", "first_name"):
        profile = _profile_for_registration(reg)
        if profile:
            name = f"{profile.first_name} {profile.last_name}".strip()
            program = profile.selected_program or reg.selected_program or ""
            scholarship_type = profile.scholarship_type or ""
        else:
            name = f"{reg.first_name} {reg.last_name}".strip()
            program = reg.selected_program or ""
            scholarship_type = ""

        key = name.lower()
        rows.append(
            {
                "key": key,
                "name": name,
                "program": program,
                "studentId": reg.reference_id,
                "scholarshipType": scholarship_type,
                "scholarshipLabel": _SCHOLARSHIP_LABELS.get(scholarship_type, "")
                if scholarship_type
                else "Regular",
            }
        )
    return rows


def scholarship_enrolled_scholars() -> list[dict]:
    """Students currently marked as scholars on their enrollment profile."""
    registry = scholarship_student_registry()
    return [
        row
        for row in registry
        if row.get("scholarshipType") and row["scholarshipType"] not in ("", "others")
    ]
