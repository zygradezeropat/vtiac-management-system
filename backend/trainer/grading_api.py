"""Trainer grading save helpers."""

from __future__ import annotations

import json

from django.contrib.auth import get_user_model

from .class_assignments import trainer_assigned_grading_keys
from .models import TrainerStudentGrade

User = get_user_model()

SCORE_MIN = 0
SCORE_MAX = 100


def _parse_score(value):
    if value is None or value == "":
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    if not (num == num):  # NaN
        return None
    num = round(num)
    if num < SCORE_MIN:
        num = SCORE_MIN
    if num > SCORE_MAX:
        num = SCORE_MAX
    return num


def validate_grade_payload(data: dict) -> tuple[dict | None, list[str]]:
    errors = []
    student_key = (data.get("student_key") or "").strip()
    student_name = (data.get("student_name") or "").strip()
    program = (data.get("program") or "").strip()

    if not student_key:
        errors.append("Student is required.")
    if not student_name:
        errors.append("Student name is required.")
    if not program:
        errors.append("Program is required.")

    scores = data.get("scores")
    if not isinstance(scores, dict):
        errors.append("Scores must be provided.")
        scores = {}

    cleaned_scores = {}
    for uc_id, row in scores.items():
        if not isinstance(row, dict):
            errors.append(f"Invalid score row for {uc_id}.")
            continue
        cleaned = {
            "written": _parse_score(row.get("written")),
            "demo": _parse_score(row.get("demo")),
            "interview": _parse_score(row.get("interview")),
        }
        for field, value in cleaned.items():
            if value is None and row.get(field) not in (None, ""):
                errors.append(
                    f"{field.title()} score for {uc_id} must be between 0 and 100."
                )
        cleaned_scores[str(uc_id)] = cleaned

    learning_outcomes = data.get("learning_outcomes")
    if not isinstance(learning_outcomes, dict):
        learning_outcomes = {}

    national = data.get("national_assessment")
    if not isinstance(national, dict):
        national = {}

    result = (national.get("result") or "").strip()
    if result and result not in {"passed", "failed", "Competent", "Not Yet Competent"}:
        errors.append("Invalid national assessment result.")

    if errors:
        return None, errors

    payload = {
        "scores": cleaned_scores,
        "learning_outcomes": {
            str(k): bool(v) for k, v in learning_outcomes.items()
        },
        "national_assessment": {
            "result": result,
            "date": (national.get("date") or "").strip(),
            "remarks": (national.get("remarks") or "").strip(),
        },
    }

    return {
        "student_key": student_key,
        "student_name": student_name,
        "program": program,
        "payload": payload,
    }, []


def save_trainer_student_grade(user, data: dict) -> TrainerStudentGrade:
    cleaned, errors = validate_grade_payload(data)
    if errors:
        raise ValueError(errors[0])

    allowed_keys = trainer_assigned_grading_keys(user)
    if cleaned["student_key"] not in allowed_keys:
        raise ValueError("You are not assigned to grade this student.")

    record, _created = TrainerStudentGrade.objects.update_or_create(
        trainer=user,
        student_key=cleaned["student_key"],
        defaults={
            "student_name": cleaned["student_name"],
            "program": cleaned["program"],
            "payload": cleaned["payload"],
        },
    )
    return record


def parse_grade_post_body(request) -> dict:
    if request.content_type and "application/json" in request.content_type:
        try:
            return json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError as exc:
            raise ValueError("Invalid JSON payload.") from exc

    return {
        "student_key": request.POST.get("student_key", ""),
        "student_name": request.POST.get("student_name", ""),
        "program": request.POST.get("program", ""),
        "scores": json.loads(request.POST.get("scores", "{}") or "{}"),
        "learning_outcomes": json.loads(
            request.POST.get("learning_outcomes", "{}") or "{}"
        ),
        "national_assessment": json.loads(
            request.POST.get("national_assessment", "{}") or "{}"
        ),
    }


PASSING_AVERAGE = 75


def serialize_grade_record(record: TrainerStudentGrade) -> dict:
    payload = record.payload if isinstance(record.payload, dict) else {}
    return {
        "student_key": record.student_key,
        "student_name": record.student_name,
        "program": record.program,
        "scores": payload.get("scores") or {},
        "learning_outcomes": payload.get("learning_outcomes") or {},
        "national_assessment": payload.get("national_assessment") or {},
        "updated_at": record.updated_at.isoformat(),
    }


def list_trainer_grade_records(user) -> list[dict]:
    qs = TrainerStudentGrade.objects.filter(trainer=user).order_by(
        "student_name", "program"
    )
    return [serialize_grade_record(record) for record in qs]
