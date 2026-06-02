"""Push finalized batch schedules to student enrollment profiles."""

from django.db.models import Q

from backend.student.models import StudentEnrollmentProfile, StudentRegistration
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
    assigned_by = assigned_by or "Registrar (finalized batch)"
    _apply_template_to_profile(
        profile, template, template_to_option_data(template), assigned_by=assigned_by
    )
    return True


def ensure_profile_schedule_from_finalized_batch(profile: StudentEnrollmentProfile) -> bool:
    """Backfill: if a finalized batch exists for this program, assign it to enrolled students only."""
    if not profile or profile.preferred_schedule_id:
        return False

    from backend.student.schedule_assignment import student_may_view_class_schedule

    if not student_may_view_class_schedule(profile):
        return False
    template = (
        RegistrarScheduleTemplate.objects.filter(
            status=RegistrarScheduleTemplate.Status.FINALIZED,
            course_name=profile.selected_program,
        )
        .order_by("-finalized_at")
        .first()
    )
    if not template:
        return False
    return assign_finalized_template_to_profile(profile, template)


def assign_finalized_template_to_students(
    template: RegistrarScheduleTemplate, *, assigned_by: str = ""
) -> int:
    """
    Create a schedule option on each matching student profile and set it as their class schedule.
    Returns the number of profiles updated.
    """
    if template.status != RegistrarScheduleTemplate.Status.FINALIZED:
        return 0

    option_data = template_to_option_data(template)
    assigned_by = assigned_by or "Registrar (finalized batch)"
    updated = 0

    for profile in profiles_for_finalized_course(template.course_name):
        _apply_template_to_profile(profile, template, option_data, assigned_by=assigned_by)
        updated += 1

    return updated
