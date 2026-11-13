"""Registrar student list — enrolled (approved) trainees."""

from django.utils import timezone

from backend.student.document_submission import get_document_submission_indicators
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
    if not scholarship_type or scholarship_type.strip().lower() in ("", "none", "regular"):
        return "Regular"
    return "Scholar"


def _serialize_approved_student(
    reg: StudentRegistration,
    profile: StudentEnrollmentProfile | None,
    is_graduate: bool = False,
    grade = None,
) -> dict:
    if profile:
        first = profile.first_name
        last = profile.last_name
        name = f"{profile.first_name} {profile.last_name}".strip()
        program = profile.selected_program or reg.selected_program
        scholarship_type = profile.scholarship_type
        email = profile.email or reg.email
        date_dt = profile.updated_at
        row_id = profile.pk
        bday = profile.birth_date or reg.birth_date
    else:
        first = reg.first_name
        last = reg.last_name
        name = f"{reg.first_name} {reg.last_name}".strip()
        program = reg.selected_program
        scholarship_type = ""
        email = reg.email
        date_dt = reg.created_at
        row_id = None
        bday = reg.birth_date

    if date_dt:
        date_display = timezone.localtime(date_dt).strftime("%Y-%m-%d")
    else:
        date_display = "—"

    graduated_at_display = "—"
    if is_graduate:
        g_dt = reg.graduated_at or getattr(grade, "updated_at", None) or date_dt
        if g_dt:
            graduated_at_display = timezone.localtime(g_dt).strftime("%Y-%m-%d")

    program_type = (
        profile.program_type if profile and profile.program_type else reg.program_type
    )

    if not scholarship_type and reg:
        from .models import ScholarGrantRecord
        grant = reg.scholarship_grants.filter(is_active=True).first()
        if not grant:
            from django.db import models as db_models
            grant = ScholarGrantRecord.objects.filter(
                is_active=True
            ).filter(
                db_models.Q(email__iexact=email) |
                (db_models.Q(last_name__iexact=last) & db_models.Q(first_name__icontains=first))
            ).first()
        if grant:
            scholarship_type = grant.scholarship_type or "tesda"

    scholar_label = _scholarship_label(scholarship_type)
    scholar_detail = _SCHOLARSHIP_LABELS.get(scholarship_type, scholarship_type) if scholarship_type else ""

    doc_indicators = get_document_submission_indicators(profile, reg)

    return {
        "id": row_id,
        "registrationId": str(reg.pk),
        "initials": _initials(first, last),
        "name": name,
        "scholarship": scholar_label,
        "scholarshipType": scholarship_type or "",
        "scholarshipDetail": scholar_detail,
        "status": "Graduated" if is_graduate else "Enrolled",
        "isGraduated": is_graduate,
        "graduatedAt": graduated_at_display,
        "date": date_display,
        "birthDate": bday.strftime("%B %d, %Y") if bday else "—",
        "program": program or "—",
        "email": email,
        "referenceId": reg.reference_id,
        "programType": program_type,
        "digitalStatus": doc_indicators["digital"]["status"],
        "digitalLabel": doc_indicators["digital"]["label"],
        "digitalBadgeClass": doc_indicators["digital"]["badgeClass"],
        "isDigitalUploaded": doc_indicators["digital"]["isUploaded"],
        "hardCopyStatus": doc_indicators["hardCopy"]["status"],
        "hardCopyLabel": doc_indicators["hardCopy"]["label"],
        "hardCopyBadgeClass": doc_indicators["hardCopy"]["badgeClass"],
        "hardCopiesSubmitted": doc_indicators["hardCopy"]["isSubmitted"],
        "hardCopySubmittedAt": doc_indicators["hardCopy"]["submittedAt"],
        "docIndicators": doc_indicators,
    }


def approved_students_queryset():
    return (
        StudentRegistration.objects.filter(status=StudentRegistration.Status.APPROVED)
        .select_related("user")
        .prefetch_related("tesda_profile__documents")
        .order_by("-created_at")
    )


def registrar_students_module_data():
    """Tabs payload for registrar student list (training, assessment-only, graduates)."""
    from .scholarship_api import sync_unlinked_scholar_grants
    from backend.trainer.egace_progress import (
        _latest_grades_index,
        _grade_for_registration,
        student_is_graduate,
    )

    sync_unlinked_scholar_grants()
    by_key, by_name_program = _latest_grades_index()
    training = []
    assessment = []
    graduates = []
    programs = set(enrollment_program_options())

    for reg in approved_students_queryset():
        profile = _profile_for_registration(reg)
        prog = (profile.selected_program if profile else "") or reg.selected_program
        grade = _grade_for_registration(reg, prog, by_key, by_name_program)
        payload = grade.payload if grade and isinstance(grade.payload, dict) else None

        is_grad = bool(reg.is_graduated or student_is_graduate(payload, prog))
        if is_grad and not reg.is_graduated:
            reg.is_graduated = True
            reg.graduated_at = getattr(grade, "updated_at", None) or timezone.now()
            reg.save(update_fields=["is_graduated", "graduated_at"])

        row = _serialize_approved_student(reg, profile, is_graduate=is_grad, grade=grade)
        if row["program"]:
            programs.add(row["program"])

        if is_grad:
            graduates.append(row)
        elif reg.program_type == StudentRegistration.ProgramType.ASSESSMENT_ONLY:
            assessment.append(row)
        else:
            training.append(row)

    program_list = sorted(programs)

    def tab(key: str, title: str, students: list):
        count = len(students)
        if key == "training":
            badge = f"{count} student{'s' if count != 1 else ''}"
        elif key == "graduates":
            badge = f"{count} graduate{'s' if count != 1 else ''}"
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
            tab("graduates", "Graduated Students", graduates),
        ],
    }
