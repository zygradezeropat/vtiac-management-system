"""Compute E.G.A.C.E milestones from enrollment and trainer grading records."""

from __future__ import annotations

from backend.registrar.models import RegistrarScheduleTemplate
from backend.student.models import StudentEnrollmentProfile, StudentRegistration
from backend.trainer.grading_sample import record_sheet_structure_for_program
from backend.trainer.models import TrainerStudentGrade

INSTITUTIONAL_UC_KEY = "institutional"
PASSING_AVERAGE = 75


def _parse_score(value) -> int | None:
    if value is None or value == "":
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    if num != num:
        return None
    num = round(num)
    return max(0, min(100, int(num)))


def _compute_average(written, demo, interview) -> float | None:
    scores = [_parse_score(written), _parse_score(demo), _parse_score(interview)]
    if any(s is None for s in scores):
        return None
    return sum(scores) / 3  # type: ignore[arg-type]


def _result_key_from_average(avg: float | None) -> str:
    if avg is None:
        return "incomplete"
    if avg >= PASSING_AVERAGE:
        return "competent"
    if avg >= 1:
        return "failed"
    return "incomplete"


def _flatten_record_sheet_units(structure: list[dict]) -> list[dict]:
    units = []
    for category in structure or []:
        for unit in category.get("units") or []:
            units.append(unit)
    return units


def _has_uc_score_row(row: dict | None) -> bool:
    if not row:
        return False
    return any(row.get(field) not in (None, "") for field in ("written", "demo", "interview"))


def _get_institutional_scores(payload: dict) -> dict:
    scores = payload.get("scores") if isinstance(payload.get("scores"), dict) else {}
    row = scores.get(INSTITUTIONAL_UC_KEY)
    if row:
        return row
    if scores:
        first = next(iter(scores.values()))
        if isinstance(first, dict):
            return first
    return {}


def _get_uc_scores(payload: dict, uc_id: str) -> dict:
    scores = payload.get("scores") if isinstance(payload.get("scores"), dict) else {}
    row = scores.get(uc_id)
    if isinstance(row, dict):
        return row
    return {}


def _competency_status_for_unit(payload: dict, uc_id: str) -> str:
    row = _get_uc_scores(payload, uc_id)
    if _has_uc_score_row(row):
        written, demo, interview = row.get("written"), row.get("demo"), row.get("interview")
    else:
        inst = _get_institutional_scores(payload)
        written, demo, interview = inst.get("written"), inst.get("demo"), inst.get("interview")
    return _result_key_from_average(_compute_average(written, demo, interview))


def student_is_graduate(payload: dict | None, program: str) -> bool:
    """True when every unit on the rating sheet is Competent."""
    if not payload:
        return False
    units = _flatten_record_sheet_units(record_sheet_structure_for_program(program))
    if not units:
        return False
    has_any_scored = False
    for unit in units:
        uc_id = unit.get("id")
        if not uc_id:
            continue
        row = _get_uc_scores(payload, uc_id)
        if _has_uc_score_row(row):
            has_any_scored = True
        status = _competency_status_for_unit(payload, uc_id)
        if status != "competent":
            return False
    return has_any_scored


def student_is_assessment_competent(payload: dict | None) -> bool:
    """True when national assessment result is Competent."""
    if not payload:
        return False
    national = payload.get("national_assessment")
    if not isinstance(national, dict):
        return False
    result = (national.get("result") or "").strip().lower()
    return result in {"competent", "passed"}


def _registration_display_name(reg: StudentRegistration) -> str:
    parts = [reg.first_name, reg.middle_name, reg.last_name]
    return " ".join(p for p in parts if p).strip() or "—"


def _initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    if len(parts) >= 2:
        return f"{parts[0][0]}{parts[-1][0]}".upper()
    return name[:2].upper() if name else "?"


def _latest_grades_index() -> tuple[dict[str, TrainerStudentGrade], dict[tuple[str, str], TrainerStudentGrade]]:
    by_key: dict[str, TrainerStudentGrade] = {}
    by_name_program: dict[tuple[str, str], TrainerStudentGrade] = {}

    for grade in TrainerStudentGrade.objects.order_by("updated_at"):
        key = (grade.student_key or "").strip()
        if key:
            existing = by_key.get(key)
            if not existing or grade.updated_at >= existing.updated_at:
                by_key[key] = grade
        name_key = (grade.student_name or "").strip().lower()
        program = (grade.program or "").strip()
        if name_key and program:
            pair = (name_key, program)
            existing = by_name_program.get(pair)
            if not existing or grade.updated_at >= existing.updated_at:
                by_name_program[pair] = grade

    return by_key, by_name_program


def _enrollment_profile(reg: StudentRegistration) -> StudentEnrollmentProfile | None:
    try:
        if getattr(reg, "tesda_profile_id", None):
            return reg.tesda_profile
    except StudentEnrollmentProfile.DoesNotExist:
        pass
    user = reg.user
    if user and hasattr(user, "enrollment_profile"):
        try:
            return user.enrollment_profile
        except StudentEnrollmentProfile.DoesNotExist:
            pass
    return None


def _batch_filter_id(program: str, batch_label: str) -> str:
    label = (batch_label or "Unassigned").strip()
    course = (program or "").strip()
    return f"{course}|{label}" if course else label


def _batch_info(
    reg: StudentRegistration,
    program: str,
    grade: TrainerStudentGrade | None,
) -> dict[str, str]:
    profile = _enrollment_profile(reg)
    if profile and profile.preferred_schedule_id:
        opt = profile.preferred_schedule
        opt_course = (opt.course_name or program or "").strip()
        if not program or opt_course == program:
            label = (opt.batch_label or "Batch 1").strip()
            return {
                "batchId": _batch_filter_id(program, label),
                "batchLabel": label,
            }

    if grade:
        key = (grade.student_key or "").strip()
        if "|" in key:
            template_id = key.split("|", 1)[1]
            template = RegistrarScheduleTemplate.objects.filter(pk=template_id).first()
            if template:
                label = (template.batch_label or "Batch 1").strip()
                return {
                    "batchId": _batch_filter_id(program, label),
                    "batchLabel": label,
                }

    return {"batchId": _batch_filter_id(program, "Unassigned"), "batchLabel": "Unassigned"}


def _grade_for_registration(
    reg: StudentRegistration,
    program: str,
    by_key: dict[str, TrainerStudentGrade],
    by_name_program: dict[tuple[str, str], TrainerStudentGrade],
) -> TrainerStudentGrade | None:
    ref = (reg.reference_id or "").strip()
    if ref:
        prefix = f"{ref}|"
        matches = [
            grade
            for key, grade in by_key.items()
            if grade.program == program and (key == ref or key.startswith(prefix))
        ]
        if matches:
            return max(matches, key=lambda g: g.updated_at)

    display = _registration_display_name(reg).lower()
    if display and program:
        return by_name_program.get((display, program))

    return None


def build_registrar_egace_rows() -> list[dict]:
    """One row per approved (enrolled) student with EGACE milestone flags."""
    by_key, by_name_program = _latest_grades_index()
    rows: list[dict] = []

    registrations = (
        StudentRegistration.objects.filter(
            status=StudentRegistration.Status.APPROVED,
        )
        .select_related(
            "tesda_profile__preferred_schedule",
            "user__enrollment_profile__preferred_schedule",
        )
        .order_by("last_name", "first_name", "reference_id")
    )

    for reg in registrations:
        program = (reg.selected_program or "").strip()
        name = _registration_display_name(reg)
        grade = _grade_for_registration(reg, program, by_key, by_name_program)
        payload = grade.payload if grade and isinstance(grade.payload, dict) else None
        batch = _batch_info(reg, program, grade)

        rows.append(
            {
                "id": str(reg.pk),
                "initials": _initials(name),
                "studentName": name,
                "course": program or "—",
                "batchId": batch["batchId"],
                "batchLabel": batch["batchLabel"],
                "referenceId": reg.reference_id,
                "enrolled": True,
                "graduate": student_is_graduate(payload, program),
                "assessment": student_is_assessment_competent(payload),
                "certificate": False,
                "employment": bool(reg.egace_employment),
            }
        )

    return rows
