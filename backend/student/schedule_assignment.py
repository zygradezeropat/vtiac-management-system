"""Registrar-assigned class schedules and student preference selection."""

from datetime import datetime

from django.utils import timezone

from .models import StudentEnrollmentProfile, StudentScheduleOption


def format_time_12h(time_24):
    if not time_24:
        return ""
    try:
        h, m = map(int, str(time_24).split(":")[:2])
    except (ValueError, TypeError):
        return str(time_24)
    ampm = "PM" if h >= 12 else "AM"
    h12 = h % 12 or 12
    return f"{h12}:{m:02d} {ampm}"


def schedule_display_label(option):
    """Same format as registrar batching (day · start – end)."""
    if not option.day or not option.time_from or not option.time_to:
        return option.label or "—"
    return (
        f"{option.day} · {format_time_12h(option.time_from)} – "
        f"{format_time_12h(option.time_to)}"
    )


def _format_date_display(value):
    if not value:
        return ""
    if hasattr(value, "strftime"):
        return value.strftime("%b %d, %Y")
    return str(value)


def schedule_option_to_dict(option, *, selected=False):
    return {
        "id": str(option.pk),
        "label": option.label,
        "display": schedule_display_label(option),
        "day": option.day,
        "time_from": option.time_from,
        "time_to": option.time_to,
        "batch_label": option.batch_label,
        "course_name": option.course_name,
        "start_date": option.start_date.isoformat() if option.start_date else "",
        "end_date": option.end_date.isoformat() if option.end_date else "",
        "start_date_display": _format_date_display(option.start_date),
        "end_date_display": _format_date_display(option.end_date),
        "trainer": option.trainer,
        "selected": selected,
    }


def get_schedule_options_for_profile(profile):
    if not profile:
        return []
    preferred_id = profile.preferred_schedule_id
    return [
        schedule_option_to_dict(
            opt,
            selected=opt.pk == preferred_id,
        )
        for opt in profile.schedule_options.order_by("sort_order", "created_at")
    ]


def save_student_schedule_choice(profile, option_id):
    """Persist the student's preferred schedule from registrar-assigned options."""
    if not profile:
        raise ValueError("Enrollment profile is required.")
    try:
        option = profile.schedule_options.get(pk=option_id)
    except StudentScheduleOption.DoesNotExist as exc:
        raise ValueError("That schedule is not assigned to you.") from exc
    profile.preferred_schedule = option
    profile.schedule_selected_at = timezone.now()
    profile.save(update_fields=["preferred_schedule", "schedule_selected_at", "updated_at"])
    return option


def replace_schedule_options(profile, options_data, *, assigned_by=""):
    """
    Replace all registrar-assigned options for a profile.

    options_data: list of dicts with label, day, time_from, time_to, and optional
    batch_label, course_name, start_date, end_date, trainer, sort_order.
    """
    if not profile:
        raise ValueError("Profile is required.")

    profile.schedule_options.all().delete()
    if profile.preferred_schedule_id:
        profile.preferred_schedule = None
        profile.schedule_selected_at = None
        profile.save(
            update_fields=["preferred_schedule", "schedule_selected_at", "updated_at"]
        )

    created = []
    for i, raw in enumerate(options_data):
        start = raw.get("start_date") or None
        end = raw.get("end_date") or None
        if isinstance(start, str) and start:
            start = datetime.strptime(start, "%Y-%m-%d").date()
        if isinstance(end, str) and end:
            end = datetime.strptime(end, "%Y-%m-%d").date()

        opt = StudentScheduleOption.objects.create(
            profile=profile,
            label=raw.get("label") or f"Option {i + 1}",
            day=raw.get("day", ""),
            time_from=raw.get("time_from", ""),
            time_to=raw.get("time_to", ""),
            batch_label=raw.get("batch_label", ""),
            course_name=raw.get("course_name", "") or profile.selected_program,
            start_date=start,
            end_date=end,
            trainer=raw.get("trainer", ""),
            sort_order=raw.get("sort_order", i),
            assigned_by=assigned_by,
        )
        created.append(opt)
    return created


def dashboard_schedule_context(profile):
    if profile:
        from backend.registrar.batch_schedule_sync import (
            ensure_profile_schedule_from_finalized_batch,
        )

        ensure_profile_schedule_from_finalized_batch(profile)
        profile.refresh_from_db(fields=["preferred_schedule", "schedule_selected_at"])

    options = get_schedule_options_for_profile(profile)
    preferred = profile.preferred_schedule if profile else None
    selected = schedule_option_to_dict(preferred, selected=True) if preferred else {}
    return {
        "schedule_options": options,
        "has_schedule_options": bool(options),
        "schedule_selected": preferred is not None,
        "selected_schedule_display": schedule_display_label(preferred) if preferred else "",
        "selected_schedule_label": preferred.label if preferred else "",
        "selected_schedule": selected,
    }
