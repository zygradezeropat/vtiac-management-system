"""Registrar student list — enrolled (approved) trainees."""

from django.utils import timezone

from backend.student.models import StudentEnrollmentProfile, StudentRegistration
from backend.student.services import SCHOLARSHIP_TYPE_CHOICES
from backend.system_admin.program_config import enrollment_program_options

from .pending_enrollment import _profile_for_registration

_SCHOLARSHIP_LABELS = dict(SCHOLARSHIP_TYPE_CHOICES)


def _initials(first: str, last: str) -> str:
    a = (first[:1] if first else "").upper()
    b = (last[:1] if last else "").upper()
    return (a + b) or "?"


def _scholarship_label(scholarship_type: str) -> str:
    if not scholarship_type or scholarship_type in ("", "others"):
        return "Regular"
    return "Scholar"


def _serialize_approved_student(reg: StudentRegistration, profile: StudentEnrollmentProfile | None) -> dict:
    if profile:
        first = profile.first_name
        last = profile.last_name
        name = f"{profile.first_name} {profile.last_name}".strip()
        program = profile.selected_program or reg.selected_program
        scholarship_type = profile.scholarship_type
        email = profile.email or reg.email
        date_dt = profile.updated_at
        row_id = profile.pk
    else:
        first = reg.first_name
        last = reg.last_name
        name = f"{reg.first_name} {reg.last_name}".strip()
        program = reg.selected_program
        scholarship_type = ""
        email = reg.email
        date_dt = reg.created_at
        row_id = None

    if date_dt:
        date_display = timezone.localtime(date_dt).strftime("%Y-%m-%d")
    else:
        date_display = "—"

    program_type = (
        profile.program_type if profile and profile.program_type else reg.program_type
    )

    return {
        "id": row_id,
        "registrationId": str(reg.pk),
        "initials": _initials(first, last),
        "name": name,
        "scholarship": _scholarship_label(scholarship_type),
        "scholarshipDetail": _SCHOLARSHIP_LABELS.get(scholarship_type, "") if scholarship_type else "",
        "status": "Enrolled",
        "date": date_display,
        "program": program or "—",
        "email": email,
        "referenceId": reg.reference_id,
        "programType": program_type,
    }


def approved_students_queryset():
    return (
        StudentRegistration.objects.filter(status=StudentRegistration.Status.APPROVED)
        .select_related("user")
        .prefetch_related("tesda_profile")
        .order_by("-created_at")
    )


def registrar_students_module_data():
    """Tabs payload for registrar student list (training vs assessment-only)."""
    training = []
    assessment = []
    programs = set(enrollment_program_options())

    for reg in approved_students_queryset():
        profile = _profile_for_registration(reg)
        row = _serialize_approved_student(reg, profile)
        if row["program"]:
            programs.add(row["program"])
        if reg.program_type == StudentRegistration.ProgramType.ASSESSMENT_ONLY:
            assessment.append(row)
        else:
            training.append(row)

    program_list = sorted(programs)

    def tab(key: str, title: str, students: list):
        count = len(students)
        if key == "training":
            badge = f"{count} student{'s' if count != 1 else ''}"
        else:
            badge = f"{count} client{'s' if count != 1 else ''}"
        return {
            "key": key,
            "title": title,
            "badgeLabel": badge,
            "students": students,
        }

    return {
        "programs": program_list,
        "modules": [
            tab("training", "Training with Assessment", training),
            tab("assessment", "Assessment Only Clients", assessment),
        ],
    }
