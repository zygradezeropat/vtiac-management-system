"""Compute E.G.A.C.E milestones from enrollment and trainer grading records."""

from __future__ import annotations

from django.db.models import Q

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


def student_is_certified(payload: dict | None, program: str) -> bool:
    """True when institutional grades show Graduate and national Assessment is competent."""
    return student_is_graduate(payload, program) and student_is_assessment_competent(
        payload
    )


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


def grade_payload_for_registration(reg: StudentRegistration) -> dict | None:
    """Latest trainer grading payload for an approved registration, if any."""
    program = (reg.selected_program or "").strip()
    if not program:
        return None
    by_key, by_name_program = _latest_grades_index()
    grade = _grade_for_registration(reg, program, by_key, by_name_program)
    if grade and isinstance(grade.payload, dict):
        return grade.payload
    return None


def registration_needs_national_assessment(
    reg: StudentRegistration, payload: dict | None = None
) -> bool:
    """
    True when this student should appear on National Competency batching.

    Assessment-only clients always use national batching for their program.
    Training students appear when institutional training is complete (Graduate)
    but national assessment is not yet Competent.
    """
    program = (reg.selected_program or "").strip()
    if not program:
        return False
    if reg.program_type == StudentRegistration.ProgramType.ASSESSMENT_ONLY:
        return True
    if reg.program_type != StudentRegistration.ProgramType.TRAINING_WITH_ASSESSMENT:
        return False
    if payload is None:
        payload = grade_payload_for_registration(reg)
    return student_is_graduate(payload, program) and not student_is_assessment_competent(
        payload
    )


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

    # Map students in active/draft/completed National Assessment batches
    assessment_templates = list(
        RegistrarScheduleTemplate.objects.filter(
            Q(batch_kind=RegistrarScheduleTemplate.BatchKind.NATIONAL_ASSESSMENT)
            | Q(batch_kind="national_assessment")
            | Q(batch_kind="assessment")
            | Q(assessment_at__isnull=False)
        )
    )

    assessment_by_reg_id: dict[str, RegistrarScheduleTemplate] = {}
    assessment_by_ref: dict[str, RegistrarScheduleTemplate] = {}
    assessment_by_name: dict[tuple[str, str], RegistrarScheduleTemplate] = {}
    assessment_by_raw_name: dict[str, RegistrarScheduleTemplate] = {}

    for t in assessment_templates:
        snapshot = t.students_snapshot or []
        for s in snapshot:
            if not isinstance(s, dict):
                continue
            sid = str(
                s.get("registrationId")
                or s.get("registration_id")
                or s.get("id")
                or s.get("student_id")
                or ""
            ).strip()
            ref = str(s.get("referenceId") or s.get("reference_id") or "").strip()
            lname = (s.get("lastName") or s.get("last_name") or "").strip().lower()
            fname = (s.get("firstName") or s.get("first_name") or "").strip().lower()
            if sid:
                assessment_by_reg_id[sid] = t
            if ref:
                assessment_by_ref[ref] = t
            if lname and fname:
                assessment_by_name[(lname, fname)] = t
            raw_full = (
                s.get("fullName") or s.get("name") or s.get("studentName") or ""
            ).strip().lower()
            if raw_full:
                assessment_by_raw_name[raw_full] = t

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

    seen_reg_ids: set[str] = set()
    seen_refs: set[str] = set()
    seen_names: set[tuple[str, str]] = set()

    for reg in registrations:
        program = (reg.selected_program or "").strip()
        name = _registration_display_name(reg)
        grade = _grade_for_registration(reg, program, by_key, by_name_program)
        payload = grade.payload if grade and isinstance(grade.payload, dict) else None
        batch = _batch_info(reg, program, grade)

        reg_id_str = str(reg.pk)
        reg_ref = (reg.reference_id or "").strip()
        lname_lower = (reg.last_name or "").strip().lower()
        fname_lower = (reg.first_name or "").strip().lower()
        name_key = (lname_lower, fname_lower)
        name_reverse = f"{lname_lower}, {fname_lower}".strip()
        name_display = name.lower().strip()

        seen_reg_ids.add(reg_id_str)
        if reg_ref:
            seen_refs.add(reg_ref)
        if lname_lower and fname_lower:
            seen_names.add(name_key)

        assessment_tmpl = (
            assessment_by_reg_id.get(reg_id_str)
            or assessment_by_ref.get(reg_ref)
            or assessment_by_name.get(name_key)
            or assessment_by_raw_name.get(name_reverse)
            or assessment_by_raw_name.get(name_display)
        )
        is_assessment_only = (reg.program_type == StudentRegistration.ProgramType.ASSESSMENT_ONLY)
        has_assessment = is_assessment_only or (assessment_tmpl is not None)

        if assessment_tmpl:
            assessment_batch_id = _batch_filter_id(
                assessment_tmpl.course_name,
                assessment_tmpl.batch_label or assessment_tmpl.name or "Batch 1",
            )
            assessment_batch_label = (
                assessment_tmpl.batch_label or assessment_tmpl.name or "Batch 1"
            ).strip()
            assessment_course = assessment_tmpl.course_name
        else:
            assessment_batch_id = batch["batchId"]
            assessment_batch_label = batch["batchLabel"]
            assessment_course = program or "—"

        snap_graduate = False
        snap_certificate = False
        snap_employment = False
        if assessment_tmpl:
            for s in (assessment_tmpl.students_snapshot or []):
                if not isinstance(s, dict):
                    continue
                sid = str(
                    s.get("registrationId")
                    or s.get("registration_id")
                    or s.get("id")
                    or s.get("student_id")
                    or ""
                ).strip()
                ref = str(s.get("referenceId") or s.get("reference_id") or "").strip()
                if (sid and sid == reg_id_str) or (reg_ref and ref == reg_ref):
                    if "graduate" in s:
                        snap_graduate = bool(s.get("graduate"))
                    if "certificate" in s:
                        snap_certificate = bool(s.get("certificate"))
                    if "employment" in s:
                        snap_employment = bool(s.get("employment"))
                    break

        rows.append(
            {
                "id": str(reg.pk),
                "initials": _initials(name),
                "studentName": name,
                "course": program or "—",
                "batchId": batch["batchId"],
                "batchLabel": batch["batchLabel"],
                "referenceId": reg.reference_id,
                "programType": reg.program_type or StudentRegistration.ProgramType.TRAINING_WITH_ASSESSMENT.value,
                "isAssessment": has_assessment,
                "hasTraining": not is_assessment_only,
                "assessmentCourse": assessment_course,
                "assessmentBatchId": assessment_batch_id,
                "assessmentBatchLabel": assessment_batch_label,
                "enrolled": True,
                "created_at_iso": reg.created_at.strftime("%Y-%m-%d") if reg.created_at else "",
                "year": reg.created_at.year if reg.created_at else 2026,
                "month": reg.created_at.month if reg.created_at else 11,
                "graduate": snap_graduate or bool(reg.is_graduated) or student_is_graduate(payload, program),
                "assessment": student_is_assessment_competent(payload),
                "certificate": snap_certificate or bool(reg.egace_certificate) or student_is_certified(payload, program),
                "employment": snap_employment or bool(reg.egace_employment),
            }
        )

    # Ensure any candidate explicitly in an active/draft assessment template snapshot is included
    for t in assessment_templates:
        snapshot = t.students_snapshot or []
        for idx, s in enumerate(snapshot):
            if not isinstance(s, dict):
                continue
            sid = str(
                s.get("registrationId")
                or s.get("registration_id")
                or s.get("id")
                or s.get("student_id")
                or ""
            ).strip()
            ref = str(s.get("referenceId") or s.get("reference_id") or "").strip()
            lname = (s.get("lastName") or s.get("last_name") or "").strip()
            fname = (s.get("firstName") or s.get("first_name") or "").strip()
            name_tuple = (lname.lower(), fname.lower())

            if sid and sid in seen_reg_ids:
                continue
            if ref and ref in seen_refs:
                continue
            if lname and fname and name_tuple in seen_names:
                continue

            full_name = (
                s.get("fullName")
                or s.get("name")
                or s.get("studentName")
                or f"{fname} {lname}".strip()
                or "Candidate"
            )
            assessment_batch_id = _batch_filter_id(
                t.course_name, t.batch_label or t.name or "Batch 1"
            )
            assessment_batch_label = (t.batch_label or t.name or "Batch 1").strip()
            row_id = sid or ref or f"assessment-{t.pk}-{idx}"

            rows.append(
                {
                    "id": row_id,
                    "initials": _initials(full_name),
                    "studentName": full_name,
                    "course": t.course_name,
                    "batchId": assessment_batch_id,
                    "batchLabel": assessment_batch_label,
                    "referenceId": ref or None,
                    "programType": StudentRegistration.ProgramType.ASSESSMENT_ONLY.value,
                    "isAssessment": True,
                    "hasTraining": False,
                    "assessmentCourse": t.course_name,
                    "assessmentBatchId": assessment_batch_id,
                    "assessmentBatchLabel": assessment_batch_label,
                    "enrolled": True,
                    "created_at_iso": "",
                    "year": 2026,
                    "month": 11,
                    "graduate": bool(s.get("graduate", False)),
                    "assessment": bool(s.get("assessment", False)),
                    "certificate": bool(s.get("certificate", False)),
                    "employment": bool(s.get("employment", False)),
                }
            )

    return rows
