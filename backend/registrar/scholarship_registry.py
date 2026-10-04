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
            first = profile.first_name
            last = profile.last_name
            name = f"{first} {last}".strip()
            program = profile.selected_program or reg.selected_program or ""
            scholarship_type = profile.scholarship_type or ""
            bday = profile.birth_date or reg.birth_date
        else:
            first = reg.first_name
            last = reg.last_name
            name = f"{first} {last}".strip()
            program = reg.selected_program or ""
            scholarship_type = ""
            bday = reg.birth_date

        key = name.lower()
        bday_iso = bday.strftime("%Y-%m-%d") if bday else ""
        bday_str = bday.strftime("%B %d, %Y") if bday else ""

        rows.append(
            {
                "key": key,
                "name": name,
                "firstName": first,
                "lastName": last,
                "program": program,
                "studentId": reg.reference_id,
                "registrationId": str(reg.pk),
                "profileId": profile.pk if profile else None,
                "scholarshipType": scholarship_type,
                "scholarshipLabel": _SCHOLARSHIP_LABELS.get(scholarship_type, scholarship_type)
                if scholarship_type
                else "Regular",
                "birthDate": bday_iso,
                "birthDateStr": bday_str,
            }
        )
    return rows


def scholarship_enrolled_scholars() -> list[dict]:
    """Students currently marked as scholars on their enrollment profile."""
    registry = scholarship_student_registry()
    return [
        row
        for row in registry
        if row.get("scholarshipType") and row["scholarshipType"].lower() not in ("", "none", "regular")
    ]
