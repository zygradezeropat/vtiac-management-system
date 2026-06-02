"""Trainer dashboard metrics from assigned students and saved grades."""

from __future__ import annotations

from backend.trainer.class_assignments import assigned_students_by_batch
from backend.trainer.egace_progress import (
    _grade_for_registration,
    _latest_grades_index,
    student_is_assessment_competent,
    student_is_graduate,
)
from backend.student.models import StudentRegistration


def trainer_dashboard_metrics(user) -> dict:
    students, batch_cards = assigned_students_by_batch(user)
    total = len(students)

    if not total:
        return {
            "total_students": 0,
            "competent_count": 0,
            "nyc_count": 0,
            "avg_attendance": "—",
            "grading_progress": 0,
        }

    by_key, by_name_program = _latest_grades_index()
    competent = 0
    assessed = 0
    with_grades = 0

    for student in students:
        program = (student.get("program") or "").strip()
        ref = (student.get("reference_id") or "").strip()
        if not ref:
            continue
        try:
            reg = StudentRegistration.objects.get(
                reference_id=ref,
                status=StudentRegistration.Status.APPROVED,
            )
        except StudentRegistration.DoesNotExist:
            continue

        grade = _grade_for_registration(reg, program, by_key, by_name_program)
        if grade:
            with_grades += 1
        payload = grade.payload if grade and isinstance(grade.payload, dict) else None
        if student_is_graduate(payload, program):
            competent += 1
        if student_is_assessment_competent(payload):
            assessed += 1

    nyc = max(0, total - competent)
    progress = round(with_grades * 100 / total) if total else 0
    attendance_label = f"{progress}% graded" if total else "—"

    return {
        "total_students": total,
        "competent_count": competent,
        "nyc_count": nyc,
        "avg_attendance": attendance_label,
        "grading_progress": progress,
    }
