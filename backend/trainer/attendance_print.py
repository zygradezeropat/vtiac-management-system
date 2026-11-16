"""Trainees daily attendance sheet — print payload for trainer Students page."""

from __future__ import annotations

from backend.student.assessment_enrollment import (
    ASSESSMENT_DEFAULT_SCHOOL_NAME,
    ASSESSMENT_DEFAULT_SCHOOL_ADDRESS,
)
from backend.trainer.class_assignments import _registration_for_student


def _program_batch_fields(batch_ctx: dict) -> dict[str, dict]:
    programs: dict[str, dict] = {}
    batches: dict[str, dict] = {}
    for card in batch_ctx.get("assigned_batches") or []:
        name = (card.get("course_name") or "").strip()
        batch_label = (card.get("batch_label") or "").strip()
        if not name:
            continue
        time_from = (card.get("time_from") or "").strip()
        time_to = (card.get("time_to") or "").strip()
        duration = card.get("schedule_display") or ""
        if time_from and time_to:
            duration = f"{duration} ({time_from} – {time_to})".strip()
        item = {
            "date_start": card.get("start_date_display") or "",
            "date_end": card.get("end_date_display") or "",
            "duration": duration.strip(),
            "delivery_mode": "",
            "location": ASSESSMENT_DEFAULT_SCHOOL_ADDRESS,
        }
        if name not in programs:
            programs[name] = item
        if batch_label:
            batches[f"{name}|{batch_label}"] = item
            batches[f"{name.lower()}|{batch_label.lower()}"] = item
    return {"by_course": programs, "by_batch": batches, **programs}


def attendance_print_payload(user, batch_ctx: dict) -> dict:
    """Students + header meta for the daily attendance print view."""
    students = []
    for row in batch_ctx.get("assigned_students") or []:
        program = (row.get("program") or "").strip()
        first = (row.get("first_name") or "").strip()
        last = (row.get("last_name") or "").strip()
        registration = _registration_for_student(first, last, program)
        contact = ""
        email = ""
        if registration:
            email = registration.email or ""
            contact = registration.phone_number or ""
            if hasattr(registration, "tesda_profile"):
                profile = registration.tesda_profile
                contact = profile.contact_number or contact
                email = profile.email or email
        students.append(
            {
                "name": row.get("name") or "—",
                "program": program,
                "batch": row.get("batch_label") or "",
                "email": email,
                "contact": contact,
            }
        )

    trainer_name = ""
    if user and getattr(user, "is_authenticated", False):
        trainer_name = user.get_full_name() or user.get_username() or "Trainer"

    return {
        "students": students,
        "meta": {
            "tvet_provider": ASSESSMENT_DEFAULT_SCHOOL_NAME,
            "trainer": trainer_name,
            "nttc_no": "",
            "nttc_validity": "",
            "programs": _program_batch_fields(batch_ctx),
            "school_address": ASSESSMENT_DEFAULT_SCHOOL_ADDRESS,
        },
    }
