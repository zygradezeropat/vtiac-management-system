"""Approved students eligible for a new batch (not scheduled / not already in training)."""

from backend.registrar.models import RegistrarScheduleTemplate
from backend.student.models import StudentEnrollmentProfile, StudentRegistration


def _student_name_key(last_name: str, first_name: str) -> tuple[str, str]:
    return (
        (last_name or "").strip().lower(),
        (first_name or "").strip().lower(),
    )


def finalized_batched_keys_for_course(course_name: str) -> set[tuple[str, str]]:
    """Students already in a finalized training batch for this program."""
    keys: set[tuple[str, str]] = set()
    for template in RegistrarScheduleTemplate.objects.filter(
        course_name=course_name,
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
) -> bool:
    key = _student_name_key(reg.last_name, reg.first_name)
    if key in batched_keys:
        return False
    if registration_has_assigned_schedule(reg):
        return False
    return True


def available_students_for_course(course_name: str) -> list[dict]:
    """Approved students not yet in a finalized batch and without an assigned schedule."""
    batched_keys = finalized_batched_keys_for_course(course_name)
    rows = StudentRegistration.objects.filter(
        status=StudentRegistration.Status.APPROVED,
        selected_program=course_name,
    ).order_by("last_name", "first_name", "id")
    return [
        {
            "lastName": row.last_name,
            "firstName": row.first_name,
            "program": row.selected_program,
        }
        for row in rows
        if is_student_available_for_batching(row, course_name, batched_keys)
    ]
