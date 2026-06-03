"""Push finalized batch schedules to student enrollment profiles."""

from django.db.models import Q

from backend.student.models import StudentEnrollmentProfile, StudentRegistration

from .batching_student_pool import (
    _profiles_for_registration,
    _student_name_key,
    finalized_batched_keys_for_course,
)
from .models import RegistrarScheduleTemplate

DAY_DISPLAY = {
    "mon": "Monday",
    "tue": "Tuesday",
    "wed": "Wednesday",
    "thu": "Thursday",
    "fri": "Friday",
    "sat": "Saturday",
    "sun": "Sunday",
}


def _schedule_display(days: list, schedule_type: str) -> str:
    if schedule_type == "weekdays":
        return "Monday – Friday"
    if schedule_type == "weekends":
        return "Saturday – Sunday"
    if not days:
        return "—"
    labels = [DAY_DISPLAY.get(d, d) for d in days if isinstance(d, str)]
    if len(labels) <= 1:
        return labels[0] if labels else "—"
    if len(labels) == 2:
        return f"{labels[0]} – {labels[1]}"
    return ", ".join(labels)


def _template_option_label(template: RegistrarScheduleTemplate) -> str:
    if template.name:
        return template.name
    day = _schedule_display(
        template.days if isinstance(template.days, list) else [],
        template.schedule_type,
    )
    return f"{template.batch_label or 'Batch 1'} · {day}"


def template_to_option_data(template: RegistrarScheduleTemplate) -> dict:
    day = _schedule_display(
        template.days if isinstance(template.days, list) else [],
        template.schedule_type,
    )
    return {
        "label": _template_option_label(template),
        "day": day,
        "time_from": template.time_from,
        "time_to": template.time_to,
        "batch_label": template.batch_label or "Batch 1",
        "course_name": template.course_name,
        "start_date": template.available_from,
        "end_date": template.available_until,
        "trainer": template.trainer_name or "",
        "sort_order": 0,
    }


def snapshot_name_keys(template: RegistrarScheduleTemplate) -> set[tuple[str, str]]:
    """Name keys from a finalized batch roster (students_snapshot)."""
    keys: set[tuple[str, str]] = set()
    snapshot = template.students_snapshot
    if not isinstance(snapshot, list):
        return keys
    for entry in snapshot:
        keys.add(
            _student_name_key(
                entry.get("lastName") or entry.get("last_name", ""),
                entry.get("firstName") or entry.get("first_name", ""),
            )
        )
    return keys


def profile_in_template_snapshot(
    profile: StudentEnrollmentProfile, template: RegistrarScheduleTemplate
) -> bool:
    """True when this profile's student is listed on the finalized batch roster."""
    keys = snapshot_name_keys(template)
    if not keys:
        return False

    reg = None
    if profile.registration_id:
        reg = profile.registration
    elif profile.user_id:
        reg = getattr(profile.user, "registration_application", None)

    if reg and reg.selected_program == template.course_name:
        return _student_name_key(reg.last_name, reg.first_name) in keys

    return (
        profile.selected_program == template.course_name
        and _student_name_key(profile.last_name, profile.first_name) in keys
    )


def profiles_for_template_snapshot(
    template: RegistrarScheduleTemplate,
) -> list[StudentEnrollmentProfile]:
    """Enrollment profiles for students on this batch's roster only."""
    keys = snapshot_name_keys(template)
    if not keys:
        return []

    seen: set[int] = set()
    profiles: list[StudentEnrollmentProfile] = []
    for reg in StudentRegistration.objects.filter(
        status=StudentRegistration.Status.APPROVED,
        selected_program=template.course_name,
    ).order_by("last_name", "first_name", "id"):
        if _student_name_key(reg.last_name, reg.first_name) not in keys:
            continue
        for profile in _profiles_for_registration(reg):
            if profile.pk in seen:
                continue
            seen.add(profile.pk)
            profiles.append(profile)
    return profiles


def profiles_for_finalized_course(course_name: str):
    """Enrollment profiles for registrar-approved (enrolled) students in this program."""
    approved_regs = StudentRegistration.objects.filter(
        status=StudentRegistration.Status.APPROVED,
        selected_program=course_name,
    )
    user_ids = approved_regs.exclude(user__isnull=True).values_list("user_id", flat=True)
    registration_ids = approved_regs.values_list("pk", flat=True)

    return (
        StudentEnrollmentProfile.objects.filter(
            Q(user_id__in=user_ids) | Q(registration_id__in=registration_ids)
        )
        .distinct()
        .select_related("user", "preferred_schedule")
    )


def _apply_template_to_profile(
    profile: StudentEnrollmentProfile,
    template: RegistrarScheduleTemplate,
    option_data: dict,
    *,
    assigned_by: str,
) -> None:
    from django.utils import timezone

    existing = profile.schedule_options.filter(
        batch_label=option_data["batch_label"],
        course_name=template.course_name,
        time_from=option_data["time_from"],
        time_to=option_data["time_to"],
    ).first()

    if existing:
        opt = existing
        opt.label = option_data["label"]
        opt.day = option_data["day"]
        opt.trainer = option_data["trainer"]
        opt.start_date = option_data["start_date"]
        opt.end_date = option_data["end_date"]
        opt.assigned_by = assigned_by
        opt.save()
    else:
        opt = profile.schedule_options.create(assigned_by=assigned_by, **option_data)

    profile.preferred_schedule = opt
    profile.schedule_selected_at = timezone.now()
    profile.save(update_fields=["preferred_schedule", "schedule_selected_at", "updated_at"])


def assign_finalized_template_to_profile(
    profile: StudentEnrollmentProfile,
    template: RegistrarScheduleTemplate,
    *,
    assigned_by: str = "",
) -> bool:
    if not profile or template.status != RegistrarScheduleTemplate.Status.FINALIZED:
        return False
    if not profile_in_template_snapshot(profile, template):
        return False
    assigned_by = assigned_by or "Registrar (finalized batch)"
    _apply_template_to_profile(
        profile, template, template_to_option_data(template), assigned_by=assigned_by
    )
    return True


def ensure_profile_schedule_from_finalized_batch(profile: StudentEnrollmentProfile) -> bool:
    """Backfill schedule only for students on a finalized batch roster."""
    if not profile or profile.preferred_schedule_id:
        return False

    from backend.student.schedule_assignment import student_may_view_class_schedule

    if not student_may_view_class_schedule(profile):
        return False

    for template in RegistrarScheduleTemplate.objects.filter(
        status=RegistrarScheduleTemplate.Status.FINALIZED,
        course_name=profile.selected_program,
    ).order_by("-finalized_at"):
        if not profile_in_template_snapshot(profile, template):
            continue
        return assign_finalized_template_to_profile(profile, template)
    return False


def assign_finalized_template_to_students(
    template: RegistrarScheduleTemplate, *, assigned_by: str = ""
) -> int:
    """
    Assign this batch's schedule only to students on students_snapshot.
    Returns the number of profiles updated.
    """
    if template.status != RegistrarScheduleTemplate.Status.FINALIZED:
        return 0

    option_data = template_to_option_data(template)
    assigned_by = assigned_by or "Registrar (finalized batch)"
    updated = 0

    for profile in profiles_for_template_snapshot(template):
        _apply_template_to_profile(profile, template, option_data, assigned_by=assigned_by)
        updated += 1

    return updated


def clear_program_schedule_for_profile(profile: StudentEnrollmentProfile, course_name: str) -> bool:
    """Remove registrar batch schedule options for a program on one profile."""
    if not profile or not course_name:
        return False

    preferred_id = profile.preferred_schedule_id
    removed = profile.schedule_options.filter(course_name=course_name).delete()[0]
    if preferred_id and not profile.schedule_options.filter(pk=preferred_id).exists():
        profile.preferred_schedule = None
        profile.schedule_selected_at = None
        profile.save(
            update_fields=["preferred_schedule", "schedule_selected_at", "updated_at"]
        )
    return removed > 0 or (
        preferred_id is not None and profile.preferred_schedule_id is None
    )


def remove_student_from_batch_snapshots(reg: StudentRegistration) -> int:
    """Drop a student from all finalized batch rosters for their program."""
    if not reg or not reg.selected_program:
        return 0

    key = _student_name_key(reg.last_name, reg.first_name)
    updated = 0
    for template in RegistrarScheduleTemplate.objects.filter(
        course_name=reg.selected_program,
        status=RegistrarScheduleTemplate.Status.FINALIZED,
    ):
        snapshot = template.students_snapshot
        if not isinstance(snapshot, list):
            continue
        filtered = [
            entry
            for entry in snapshot
            if _student_name_key(
                entry.get("lastName") or entry.get("last_name", ""),
                entry.get("firstName") or entry.get("first_name", ""),
            )
            != key
        ]
        if len(filtered) == len(snapshot):
            continue
        template.students_snapshot = filtered
        template.save(update_fields=["students_snapshot", "updated_at"])
        updated += 1
    return updated


def unbatch_student(reg: StudentRegistration, *, clear_schedule: bool = True) -> dict:
    """Remove student from finalized rosters and optionally clear their class schedule."""
    removed_from = remove_student_from_batch_snapshots(reg)
    profiles_cleared = 0
    if clear_schedule:
        for profile in _profiles_for_registration(reg):
            if clear_program_schedule_for_profile(profile, reg.selected_program):
                profiles_cleared += 1
    return {
        "removed_from_batches": removed_from,
        "profiles_cleared": profiles_cleared,
    }


def reconcile_orphan_batch_schedules(*, dry_run: bool = False) -> dict:
    """
    Clear class schedules on approved students who are not on any finalized batch roster
    for their program (fixes legacy auto-assign-to-all behavior).
    """
    cleared_regs = 0
    cleared_profiles = 0

    for reg in StudentRegistration.objects.filter(
        status=StudentRegistration.Status.APPROVED
    ).exclude(selected_program=""):
        batched_keys = finalized_batched_keys_for_course(reg.selected_program)
        key = _student_name_key(reg.last_name, reg.first_name)
        if key in batched_keys:
            continue

        touched = False
        for profile in _profiles_for_registration(reg):
            has_schedule = profile.preferred_schedule_id or profile.schedule_options.filter(
                course_name=reg.selected_program
            ).exists()
            if not has_schedule:
                continue
            if dry_run:
                touched = True
                cleared_profiles += 1
                continue
            if clear_program_schedule_for_profile(profile, reg.selected_program):
                touched = True
                cleared_profiles += 1

        if touched:
            cleared_regs += 1

    return {
        "dry_run": dry_run,
        "registrations_cleared": cleared_regs,
        "profiles_cleared": cleared_profiles,
    }
