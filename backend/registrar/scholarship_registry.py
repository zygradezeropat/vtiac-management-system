"""Approved students with scholarship data for registrar scholarship matching."""

from backend.registrar.pending_enrollment import _profile_for_registration
from backend.student.models import StudentRegistration
from backend.student.services import SCHOLARSHIP_TYPE_CHOICES

_SCHOLARSHIP_LABELS = dict(SCHOLARSHIP_TYPE_CHOICES)


def scholarship_student_registry() -> list[dict]:
    from .scholarship_api import sync_unlinked_scholar_grants

    sync_unlinked_scholar_grants()
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
                "email": profile.email if profile else reg.email,
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


def scholarship_masterlist_records() -> list[dict]:
    """Fetch all saved ScholarGrantRecord rows from database for Masterlist view."""
    from .models import ScholarGrantRecord

    records = []
    qs = ScholarGrantRecord.objects.select_related("batch", "profile", "registration").order_by("-granted_at")
    for r in qs:
        scholar_name = r.scholar_name or f"{r.first_name or ''} {r.last_name or ''}".strip() or "Scholar Record"
        sponsor = r.sponsor_name or (r.batch.sponsor_name if r.batch else "Scholarship Grant")
        stype = r.scholarship_type or "tesda"
        stype_label = _SCHOLARSHIP_LABELS.get(stype, stype.upper())

        is_linked = bool(r.profile_id or r.registration_id)
        status_label = "Linked (Enrolled Student)" if is_linked else "Saved Scholar Record"

        records.append(
            {
                "id": str(r.id),
                "no": r.no or "—",
                "scholarName": scholar_name,
                "lastName": r.last_name or "—",
                "firstName": r.first_name or "—",
                "middleName": r.middle_name or "—",
                "birthDate": r.birthdate or "—",
                "address": r.address or "—",
                "email": r.email or "—",
                "program": r.program or "—",
                "sponsor": sponsor,
                "slotId": r.slot_id or "—",
                "amount": r.amount or "—",
                "scholarshipType": stype,
                "scholarshipLabel": stype_label,
                "isLinked": is_linked,
                "statusLabel": status_label,
                "grantedAt": r.granted_at.strftime("%Y-%m-%d %I:%M %p") if r.granted_at else "—",
            }
        )
    return records
