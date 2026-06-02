"""Finalized registrar batches assigned to the logged-in trainer."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from django.db.models import Q

from backend.registrar.batch_schedule_sync import (
    _schedule_display,
    _template_option_label,
    profiles_for_finalized_course,
)
from backend.registrar.models import RegistrarScheduleTemplate
from backend.student.models import StudentRegistration
from backend.trainer.models import TrainerAccountRequest


def _trainer_display_name(req: TrainerAccountRequest) -> str:
    parts = [req.first_name, req.middle_name, req.last_name]
    return " ".join(p for p in parts if p).strip()


def trainer_account_request_for_user(user):
    if not user or not getattr(user, "is_authenticated", False):
        return None
    email = (getattr(user, "email", None) or "").strip()
    if not email:
        return None
    return TrainerAccountRequest.objects.filter(
        email__iexact=email,
        status=TrainerAccountRequest.Status.APPROVED,
    ).first()


def _trainer_name_for_lookup(
    trainer_req: Optional[TrainerAccountRequest], user=None
) -> str:
    if trainer_req:
        name = _trainer_display_name(trainer_req)
        if name:
            return name
    if user and getattr(user, "is_authenticated", False):
        return (user.get_full_name() or "").strip()
    return ""


def finalized_batches_for_trainer(
    trainer_req: Optional[TrainerAccountRequest], *, user=None
):
    qs = RegistrarScheduleTemplate.objects.filter(
        status=RegistrarScheduleTemplate.Status.FINALIZED,
    )
    if trainer_req:
        name = _trainer_name_for_lookup(trainer_req, user)
        if name:
            qs = qs.filter(
                Q(trainer_request=trainer_req) | Q(trainer_name__iexact=name)
            )
        else:
            qs = qs.filter(trainer_request=trainer_req)
    else:
        name = _trainer_name_for_lookup(None, user)
        if not name:
            return qs.none()
        qs = qs.filter(trainer_name__iexact=name)
    return qs.order_by("-finalized_at", "-updated_at")


def _format_date(value) -> str:
    if not value:
        return ""
    if hasattr(value, "strftime"):
        return value.strftime("%b %d, %Y")
    return str(value)


def _batch_student_count(template: RegistrarScheduleTemplate) -> int:
    if isinstance(template.students_snapshot, list) and template.students_snapshot:
        return len(template.students_snapshot)
    return profiles_for_finalized_course(template.course_name).count()


def batch_to_dashboard_dict(template: RegistrarScheduleTemplate) -> dict:
    days = template.days if isinstance(template.days, list) else []
    day_display = _schedule_display(days, template.schedule_type)
    time_display = ""
    if template.time_from and template.time_to:
        time_display = f"{template.time_from} – {template.time_to}"
    schedule_display = f"{day_display} · {time_display}" if time_display else day_display
    return {
        "id": template.pk,
        "course_name": template.course_name,
        "batch_label": template.batch_label or "Batch 1",
        "name": template.name or "",
        "label": _template_option_label(template),
        "day_display": day_display,
        "time_from": template.time_from,
        "time_to": template.time_to,
        "schedule_display": schedule_display,
        "start_date_display": _format_date(template.available_from),
        "end_date_display": _format_date(template.available_until),
        "student_count": _batch_student_count(template),
        "finalized_at_display": _format_date(
            template.finalized_at.date() if template.finalized_at else None
        ),
        "has_conflict": False,
        "conflict_count": 0,
    }


def _effective_days(template: RegistrarScheduleTemplate) -> set[str]:
    schedule_type = (template.schedule_type or "").strip().lower()
    if schedule_type == "weekdays":
        return {"mon", "tue", "wed", "thu", "fri"}
    if schedule_type == "weekends":
        return {"sat", "sun"}
    days = template.days if isinstance(template.days, list) else []
    return {str(day).strip().lower() for day in days if str(day).strip()}


def _parse_time(value: str):
    raw = (value or "").strip()
    if not raw:
        return None
    for fmt in ("%H:%M", "%I:%M %p", "%I:%M%p"):
        try:
            return datetime.strptime(raw, fmt).time()
        except ValueError:
            continue
    return None


def _date_overlap(
    start_a: date | None, end_a: date | None, start_b: date | None, end_b: date | None
) -> bool:
    # Treat open-ended ranges as potentially overlapping.
    if not start_a or not end_a or not start_b or not end_b:
        return True
    return start_a <= end_b and start_b <= end_a


def _time_overlap(template_a: RegistrarScheduleTemplate, template_b: RegistrarScheduleTemplate) -> bool:
    start_a = _parse_time(template_a.time_from)
    end_a = _parse_time(template_a.time_to)
    start_b = _parse_time(template_b.time_from)
    end_b = _parse_time(template_b.time_to)
    # If a time cannot be parsed, assume overlap to avoid missing conflicts.
    if not start_a or not end_a or not start_b or not end_b:
        return True
    return start_a < end_b and start_b < end_a


def _templates_conflict(
    template_a: RegistrarScheduleTemplate, template_b: RegistrarScheduleTemplate
) -> bool:
    if not _date_overlap(
        template_a.available_from,
        template_a.available_until,
        template_b.available_from,
        template_b.available_until,
    ):
        return False
    if not (_effective_days(template_a) & _effective_days(template_b)):
        return False
    return _time_overlap(template_a, template_b)


def _conflict_map_for_batches(
    batches: list[RegistrarScheduleTemplate],
) -> dict[int, set[int]]:
    conflicts: dict[int, set[int]] = {}
    for i, current in enumerate(batches):
        for other in batches[i + 1 :]:
            if not _templates_conflict(current, other):
                continue
            conflicts.setdefault(current.pk, set()).add(other.pk)
            conflicts.setdefault(other.pk, set()).add(current.pk)
    return conflicts


def _assigned_students_from_batches(batches: list[RegistrarScheduleTemplate]) -> list[dict]:
    seen: set[tuple] = set()
    rows: list[dict] = []

    for template in batches:
        schedule_display = batch_to_dashboard_dict(template)["schedule_display"]
        for entry in _students_for_batch(template):
            key = _student_dedupe_key(entry, template.course_name)
            if key in seen:
                continue
            seen.add(key)
            rows.append(_student_row(entry, template, schedule_display))

    rows.sort(key=lambda r: (r["name"].split()[-1].lower(), r["name"].lower()))
    return rows


def _student_filter_options(students: list[dict]) -> dict:
    programs = sorted({s["program"] for s in students if s.get("program")})
    batches = sorted({s["batch_label"] for s in students if s.get("batch_label")})
    schedules = sorted({s["schedule"] for s in students if s.get("schedule")})
    return {
        "student_filter_programs": programs,
        "student_filter_batches": batches,
        "student_filter_schedules": schedules,
    }


def trainer_class_schedule_context(user) -> dict:
    """Shared batch + student data for dashboard and My Students."""
    trainer_req = trainer_account_request_for_user(user)
    batches = list(finalized_batches_for_trainer(trainer_req, user=user))
    batch_cards = [batch_to_dashboard_dict(b) for b in batches]
    conflicts = _conflict_map_for_batches(batches)
    for card in batch_cards:
        linked = conflicts.get(card["id"], set())
        card["has_conflict"] = bool(linked)
        card["conflict_count"] = len(linked)
    students = _assigned_students_from_batches(batches)
    total_students = len(students) or sum(c["student_count"] for c in batch_cards)
    return {
        "has_assigned_classes": bool(batch_cards),
        "assigned_batches": batch_cards,
        "assigned_class_count": len(batch_cards),
        "total_assigned_students": total_students,
        "assigned_students": students,
        "has_assigned_students": bool(students),
        **_student_filter_options(students),
    }


def _students_for_batch(template: RegistrarScheduleTemplate) -> list[dict]:
    if isinstance(template.students_snapshot, list) and template.students_snapshot:
        return template.students_snapshot
    return [
        {
            "firstName": row.first_name,
            "lastName": row.last_name,
            "program": row.selected_program,
        }
        for row in StudentRegistration.objects.filter(
            status=StudentRegistration.Status.APPROVED,
            selected_program=template.course_name,
        ).order_by("last_name", "first_name", "id")
    ]


def _student_initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    if len(parts) >= 2:
        return f"{parts[0][0]}{parts[-1][0]}".upper()
    return name[:2].upper() if name else "?"


def _student_dedupe_key(entry: dict, program: str) -> tuple:
    first = (entry.get("firstName") or entry.get("first_name") or "").strip().lower()
    last = (entry.get("lastName") or entry.get("last_name") or "").strip().lower()
    prog = (entry.get("program") or program or "").strip().lower()
    return last, first, prog


def _registration_for_student(first: str, last: str, program: str):
    if not first or not last:
        return None
    return (
        StudentRegistration.objects.filter(
            status=StudentRegistration.Status.APPROVED,
            selected_program=program,
            first_name__iexact=first,
            last_name__iexact=last,
        )
        .order_by("-created_at")
        .first()
    )


def _student_row(entry: dict, template: RegistrarScheduleTemplate, schedule_display: str) -> dict:
    first = (entry.get("firstName") or entry.get("first_name") or "").strip()
    last = (entry.get("lastName") or entry.get("last_name") or "").strip()
    middle = (entry.get("middleName") or entry.get("middle_name") or "").strip()
    program = (entry.get("program") or template.course_name or "").strip()
    name = " ".join(p for p in (first, middle, last) if p).strip() or "—"
    registration = _registration_for_student(first, last, program)
    if registration and not middle:
        middle = (registration.middle_name or "").strip()
    return {
        "name": name,
        "first_name": first,
        "middle_name": middle,
        "last_name": last,
        "initials": _student_initials(name),
        "program": program,
        "schedule": schedule_display,
        "batch_label": template.batch_label or "Batch 1",
        "batch_id": str(template.pk),
        "reference_id": registration.reference_id if registration else "",
        "search_text": f"{name} {program} {schedule_display}".lower(),
    }


def trainer_assigned_students(user) -> list[dict]:
    """Students in finalized batches assigned to this trainer."""
    return trainer_class_schedule_context(user)["assigned_students"]


def assigned_students_by_batch(user) -> tuple[list[dict], list[dict]]:
    """Per-batch student roster (no cross-batch dedupe) for record sheets."""
    trainer_req = trainer_account_request_for_user(user)
    batches = list(finalized_batches_for_trainer(trainer_req, user=user))
    batch_cards = [batch_to_dashboard_dict(b) for b in batches]
    students: list[dict] = []
    for template, card in zip(batches, batch_cards):
        schedule_display = card["schedule_display"]
        for entry in _students_for_batch(template):
            students.append(_student_row(entry, template, schedule_display))
    return students, batch_cards
