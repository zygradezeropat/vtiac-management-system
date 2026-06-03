"""Approved students eligible for training or national-assessment batches."""

from backend.registrar.models import RegistrarScheduleTemplate
from backend.student.models import StudentEnrollmentProfile, StudentRegistration
from backend.trainer.egace_progress import (
    grade_payload_for_registration,
    registration_needs_national_assessment,
)


def _student_name_key(last_name: str, first_name: str) -> tuple[str, str]:
    return (
        (last_name or "").strip().lower(),
        (first_name or "").strip().lower(),
    )


def finalized_batched_keys_for_course(
    course_name: str,
    *,
    batch_kind: str = RegistrarScheduleTemplate.BatchKind.TRAINING,
) -> set[tuple[str, str]]:
    """Students already in a finalized batch roster for this program and batch kind."""
    keys: set[tuple[str, str]] = set()
    for template in RegistrarScheduleTemplate.objects.filter(
        course_name=course_name,
        batch_kind=batch_kind,
        status=RegistrarScheduleTemplate.Status.FINALIZED,
    ):
        snapshot = template.students_snapshot
        if not isinstance(snapshot, list):
            continue
        for entry in snapshot:
            keys.add(
                _student_name_key(
                    entry.get("lastName") or entry.get("last_name", ""),
                    entry.get("firstName") or entry.get("first_name", ""),
                )
            )
    return keys


def _profiles_for_registration(reg: StudentRegistration):
    """Enrollment profile(s) that may belong to this registration."""
    if reg.user_id:
        profile = StudentEnrollmentProfile.objects.filter(user_id=reg.user_id).first()
        if profile:
            return [profile]
    return list(
        StudentEnrollmentProfile.objects.filter(
            first_name__iexact=reg.first_name,
            last_name__iexact=reg.last_name,
            selected_program=reg.selected_program,
        )
    )


def registration_has_assigned_schedule(reg: StudentRegistration) -> bool:
    """True when the student already has a class schedule for batching purposes."""
    for profile in _profiles_for_registration(reg):
        if profile.preferred_schedule_id:
            return True
        if profile.schedule_options.filter(course_name=reg.selected_program).exists():
            return True
    return False


def is_student_available_for_batching(
    reg: StudentRegistration,
    course_name: str,
    batched_keys: set[tuple[str, str]],
    *,
    batch_kind: str = RegistrarScheduleTemplate.BatchKind.TRAINING,
) -> bool:
    if (reg.selected_program or "").strip() != (course_name or "").strip():
        return False

    if batch_kind == RegistrarScheduleTemplate.BatchKind.NATIONAL_ASSESSMENT:
        if not registration_needs_national_assessment(
            reg, grade_payload_for_registration(reg)
        ):
            return False
    elif reg.program_type == StudentRegistration.ProgramType.ASSESSMENT_ONLY:
        return False

    key = _student_name_key(reg.last_name, reg.first_name)
    if key in batched_keys:
        return False

    if batch_kind == RegistrarScheduleTemplate.BatchKind.NATIONAL_ASSESSMENT:
        if (
            reg.program_type == StudentRegistration.ProgramType.ASSESSMENT_ONLY
            and registration_has_assigned_schedule(reg)
        ):
            return False
        return True

    if registration_has_assigned_schedule(reg):
        return False
    return True


def available_students_for_course(
    course_name: str,
    *,
    batch_kind: str = RegistrarScheduleTemplate.BatchKind.TRAINING,
) -> list[dict]:
    """Approved students eligible for a new batch of the given kind."""
    batched_keys = finalized_batched_keys_for_course(course_name, batch_kind=batch_kind)
    rows = StudentRegistration.objects.filter(
        status=StudentRegistration.Status.APPROVED,
        selected_program=course_name,
    ).order_by("last_name", "first_name", "id")
    return [
        {
            "lastName": row.last_name,
            "firstName": row.first_name,
            "program": row.selected_program,
            "programType": row.program_type,
        }
        for row in rows
        if is_student_available_for_batching(
            row, course_name, batched_keys, batch_kind=batch_kind
        )
    ]

