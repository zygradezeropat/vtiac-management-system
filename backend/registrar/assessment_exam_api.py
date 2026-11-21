"""Registrar API & Service — National Assessment Examination Grading."""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from backend.accounts.services import require_portal_access
from backend.registrar.models import AssessmentExamGrade, RegistrarScheduleTemplate
from backend.student.models import StudentRegistration
from backend.system_admin.touch_logger import log_staff_touch
from backend.trainer.grading_api import _parse_score
from backend.trainer.grading_sample import (
    record_sheet_structure_for_program,
    unit_competencies_for_program,
)
from backend.trainer.models import TrainerStudentGrade

from .services import REGISTRAR_ROLE


def _date_str(d) -> str:
    if not d:
        return ""
    if hasattr(d, "strftime"):
        return d.strftime("%Y-%m-%d")
    return str(d)[:10]


def build_assessment_grading_context() -> dict[str, Any]:
    """Dig all assessment exam batches, candidate test records, and program competency structures from DB."""
    today = timezone.localdate()
    today_str = today.strftime("%Y-%m-%d")

    # 1. Fetch all national assessment batches
    templates = list(
        RegistrarScheduleTemplate.objects.filter(
            Q(batch_kind=RegistrarScheduleTemplate.BatchKind.NATIONAL_ASSESSMENT)
            | Q(batch_kind="national_assessment")
            | Q(batch_kind="assessment")
            | Q(assessment_at__isnull=False)
        ).order_by("-updated_at")
    )

    # 2. Index existing grades from AssessmentExamGrade and TrainerStudentGrade
    exam_grades_by_key: dict[str, AssessmentExamGrade] = {}
    for eg in AssessmentExamGrade.objects.all():
        k1 = f"{eg.student_key}|{eg.program}".lower()
        exam_grades_by_key[k1] = eg
        exam_grades_by_key[eg.student_key.lower()] = eg

    trainer_grades_by_key: dict[str, TrainerStudentGrade] = {}
    for tg in TrainerStudentGrade.objects.all().order_by("updated_at"):
        k1 = f"{tg.student_key}|{tg.program}".lower()
        trainer_grades_by_key[k1] = tg
        trainer_grades_by_key[tg.student_key.lower()] = tg

    # Distinct programs list
    programs_set: set[str] = set()
    batches_data: list[dict[str, Any]] = []
    all_candidates: list[dict[str, Any]] = []

    for t in templates:
        prog_name = (t.course_name or t.examination_course or "General Assessment").strip()
        programs_set.add(prog_name)

        sched_date = t.available_from or (t.assessment_at.date() if t.assessment_at else None)
        sched_date_str = _date_str(sched_date)

        # Lock condition: "content inside will open (typically lock) if the schedule is today and beyond"
        is_locked = bool(sched_date and sched_date > today)
        lock_status = "locked" if is_locked else "open"
        lock_message = (
            f"Locked until {sched_date.strftime('%B %d, %Y')}"
            if is_locked
            else "Open for Examination Grading"
        )

        batch_item = {
            "id": t.pk,
            "courseName": prog_name,
            "batchLabel": t.batch_label or t.name or f"Batch {t.pk}",
            "scheduleDate": sched_date_str,
            "scheduleDateFormatted": sched_date.strftime("%B %d, %Y") if sched_date else "To Be Announced",
            "venue": t.examination_course or "VTIAC Assessment Center",
            "assessorName": t.examiner_name or t.trainer_name or "Official TESDA Assessor",
            "isLocked": is_locked,
            "lockStatus": lock_status,
            "lockMessage": lock_message,
            "studentCount": len(t.students_snapshot or []),
        }

        # Process candidates in this batch snapshot
        batch_candidates = []
        for idx, s in enumerate(t.students_snapshot or []):
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
            full_name = (
                s.get("fullName")
                or s.get("name")
                or s.get("studentName")
                or f"{s.get('lastName', '')}, {s.get('firstName', '')}".strip(", ")
                or "Candidate"
            ).strip()

            prog_type = (
                s.get("programType")
                or s.get("program_type")
                or ("assessment_only" if s.get("isAssessment") and not s.get("hasTraining") else "training_with_assessment")
            )
            is_assessment_only = (prog_type == "assessment_only")

            # Look up existing exam grade
            key_candidates = [
                f"{ref}|{prog_name}".lower() if ref else "",
                f"{sid}|{prog_name}".lower() if sid else "",
                ref.lower() if ref else "",
                sid.lower() if sid else "",
                full_name.lower(),
            ]

            existing_grade = None
            for k in key_candidates:
                if k and k in exam_grades_by_key:
                    existing_grade = exam_grades_by_key[k]
                    break

            existing_trainer = None
            for k in key_candidates:
                if k and k in trainer_grades_by_key:
                    existing_trainer = trainer_grades_by_key[k]
                    break

            # Extract existing score payload
            scores: dict = {}
            learning_outcomes: dict = {}
            national_res = ""
            exam_date = sched_date_str or today_str
            examiner = batch_item["assessorName"]
            remarks = ""

            if existing_grade:
                scores = existing_grade.scores or {}
                learning_outcomes = existing_grade.learning_outcomes or {}
                nat = existing_grade.national_assessment or {}
                national_res = nat.get("result") or existing_grade.result or ""
                exam_date = nat.get("date") or exam_date
                examiner = existing_grade.examiner_name or nat.get("examiner") or examiner
                remarks = nat.get("remarks") or ""
            elif existing_trainer and isinstance(existing_trainer.payload, dict):
                tp = existing_trainer.payload
                scores = tp.get("scores") or {}
                learning_outcomes = tp.get("learning_outcomes") or {}
                nat = tp.get("national_assessment") or {}
                national_res = nat.get("result") or ""
                exam_date = nat.get("date") or exam_date
                examiner = nat.get("examiner") or examiner
                remarks = nat.get("remarks") or ""

            # Standardize verdict
            res_lower = national_res.strip().lower()
            if res_lower in {"competent", "passed"}:
                verdict_status = "competent"
                verdict_label = "Competent"
                badge_class = "bg-success"
            elif res_lower in {"not yet competent", "failed", "nyc"}:
                verdict_status = "not_yet_competent"
                verdict_label = "Not Yet Competent"
                badge_class = "bg-danger"
            else:
                verdict_status = "pending"
                verdict_label = "Not Yet Assessed"
                badge_class = "bg-secondary"

            cand_obj = {
                "id": sid or f"cand-{t.pk}-{idx}",
                "registrationId": sid,
                "referenceId": ref or "—",
                "fullName": full_name,
                "batchId": t.pk,
                "batchLabel": batch_item["batchLabel"],
                "courseName": prog_name,
                "programType": prog_type,
                "isAssessmentOnly": is_assessment_only,
                "categoryLabel": "Assessment Only" if is_assessment_only else "Training with Assessment",
                "scheduleDate": sched_date_str,
                "scheduleDateFormatted": batch_item["scheduleDateFormatted"],
                "isLocked": is_locked,
                "scores": scores,
                "learningOutcomes": learning_outcomes,
                "assessmentResult": verdict_status,
                "assessmentResultLabel": verdict_label,
                "assessmentBadgeClass": badge_class,
                "examDate": exam_date,
                "examinerName": examiner,
                "remarks": remarks,
            }
            batch_candidates.append(cand_obj)
            all_candidates.append(cand_obj)

        batch_item["candidates"] = batch_candidates
        batches_data.append(batch_item)

    # 3. Build program competency library mapping for grading sheets
    programs_competencies: dict[str, list[dict]] = {}
    for prog in sorted(programs_set):
        ucs = unit_competencies_for_program(prog)
        programs_competencies[prog] = ucs

    return {
        "today": today_str,
        "today_formatted": today.strftime("%B %d, %Y"),
        "batches": batches_data,
        "candidates": all_candidates,
        "programs": sorted(programs_set),
        "competencies_by_program": programs_competencies,
    }


@login_required(login_url="/")
@require_GET
def assessment_grading_data_api(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return JsonResponse({"ok": False, "error": "Access denied."}, status=403)

    data = build_assessment_grading_context()
    return JsonResponse({"ok": True, **data})


@login_required(login_url="/")
@require_POST
def assessment_grading_save_api(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return JsonResponse({"ok": False, "error": "Access denied."}, status=403)

    try:
        body = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "error": "Invalid JSON payload."}, status=400)

    student_key = (body.get("student_key") or body.get("studentKey") or "").strip()
    student_name = (body.get("student_name") or body.get("studentName") or "").strip()
    program = (body.get("program") or body.get("courseName") or "").strip()
    template_id = body.get("template_id") or body.get("batchId")

    if not student_key or not student_name or not program:
        return JsonResponse(
            {"ok": False, "error": "student_key, student_name, and program are required."},
            status=400,
        )

    today = timezone.localdate()

    # Verify template lock condition: if schedule is in the future, prevent saving
    template = None
    if template_id:
        try:
            template = RegistrarScheduleTemplate.objects.get(pk=int(template_id))
            sched_date = template.available_from or (template.assessment_at.date() if template.assessment_at else None)
            if sched_date and sched_date > today:
                return JsonResponse(
                    {
                        "ok": False,
                        "error": f"Examination is locked until {sched_date.strftime('%B %d, %Y')}. Grades cannot be recorded before the scheduled exam date.",
                    },
                    status=400,
                )
        except (RegistrarScheduleTemplate.DoesNotExist, ValueError):
            pass

    # Parse and clean scores
    raw_scores = body.get("scores") or {}
    cleaned_scores = {}
    total_written = 0
    total_demo = 0
    total_interview = 0
    scored_units_count = 0

    for uc_id, row in raw_scores.items():
        if not isinstance(row, dict):
            continue
        w = _parse_score(row.get("written"))
        d = _parse_score(row.get("demo"))
        i = _parse_score(row.get("interview"))

        vals = [v for v in [w, d, i] if v is not None]
        avg = round(sum(vals) / len(vals), 1) if vals else None
        cleaned_scores[str(uc_id)] = {
            "written": w,
            "demo": d,
            "interview": i,
            "average": avg,
            "status": "competent" if (avg is not None and avg >= 75) else ("nyc" if avg is not None else ""),
        }
        if w is not None:
            total_written += w
        if d is not None:
            total_demo += d
        if i is not None:
            total_interview += i
        if vals:
            scored_units_count += 1

    learning_outcomes = body.get("learning_outcomes") or {}
    national_data = body.get("national_assessment") or {}
    verdict = (national_data.get("result") or body.get("result") or "").strip().lower()

    if verdict not in {"competent", "passed", "not_yet_competent", "failed", "nyc"}:
        return JsonResponse(
            {"ok": False, "error": "Valid assessment result (Competent or Not Yet Competent) is required."},
            status=400,
        )

    is_competent = verdict in {"competent", "passed"}
    result_val = "competent" if is_competent else "not_yet_competent"

    exam_date = (national_data.get("date") or body.get("exam_date") or today.strftime("%Y-%m-%d")).strip()
    examiner = (national_data.get("examiner") or body.get("examiner_name") or "Official TESDA Assessor").strip()
    remarks = (national_data.get("remarks") or "").strip()

    final_national = {
        "result": "Competent" if is_competent else "Not Yet Competent",
        "date": exam_date,
        "examiner": examiner,
        "remarks": remarks,
    }

    full_payload = {
        "scores": cleaned_scores,
        "learning_outcomes": {str(k): bool(v) for k, v in learning_outcomes.items()},
        "national_assessment": final_national,
    }

    with transaction.atomic():
        # 1. Look up student registration if applicable
        reg = (
            StudentRegistration.objects.filter(pk=student_key).first()
            if len(student_key) == 36
            else StudentRegistration.objects.filter(reference_id__iexact=student_key).first()
        )
        if not reg:
            reg = StudentRegistration.objects.filter(
                last_name__iexact=student_name.split(",")[0].strip()
            ).first()

        # 2. Update or create AssessmentExamGrade
        exam_grade, _ = AssessmentExamGrade.objects.update_or_create(
            student_key=student_key,
            program=program,
            defaults={
                "template": template,
                "registration": reg,
                "student_name": student_name,
                "scores": cleaned_scores,
                "learning_outcomes": full_payload["learning_outcomes"],
                "national_assessment": final_national,
                "result": result_val,
                "is_competent": is_competent,
                "examiner_name": examiner,
                "assessed_by": request.user,
                "assessed_at": timezone.now(),
            },
        )

        # 3. Synchronize with TrainerStudentGrade so E.G.A.C.E table & Reports automatically detect Competent
        TrainerStudentGrade.objects.update_or_create(
            trainer=request.user,
            student_key=student_key,
            defaults={
                "student_name": student_name,
                "program": program,
                "payload": full_payload,
            },
        )

        # 4. If reference_id is different from student_key, also update by reference_id
        if reg and reg.reference_id and reg.reference_id.lower() != student_key.lower():
            TrainerStudentGrade.objects.update_or_create(
                trainer=request.user,
                student_key=reg.reference_id,
                defaults={
                    "student_name": student_name,
                    "program": program,
                    "payload": full_payload,
                },
            )

        # 5. Update candidate entry in template snapshot
        if template:
            snapshot = list(template.students_snapshot or [])
            changed = False
            for s in snapshot:
                if not isinstance(s, dict):
                    continue
                sid = str(s.get("registrationId") or s.get("id") or "").strip().lower()
                sref = str(s.get("referenceId") or "").strip().lower()
                sname = (s.get("fullName") or s.get("name") or "").strip().lower()

                if (
                    sid == student_key.lower()
                    or sref == student_key.lower()
                    or (reg and sid == str(reg.pk).lower())
                    or (reg and reg.reference_id and sref == reg.reference_id.lower())
                    or sname == student_name.lower()
                ):
                    s["assessment"] = is_competent
                    s["assessment_result"] = final_national["result"]
                    s["assessment_date"] = exam_date
                    s["examiner_name"] = examiner
                    changed = True

            if changed:
                template.students_snapshot = snapshot
                template.save(update_fields=["students_snapshot", "updated_at"])

        # 6. Log touch audit trail
        log_staff_touch(
            user=request.user,
            portal_role="Registrar Assessor",
            module="Assessment Exam Grading",
            action=f"Graded Assessment Exam: {final_national['result']}",
            target_type="Assessment Candidate",
            target_id=student_key,
            target_name=student_name,
            details=f"Program: {program} | Assessor: {examiner} | Date: {exam_date} | Competent: {is_competent}",
        )

    return JsonResponse(
        {
            "ok": True,
            "message": f"Assessment exam grade for {student_name} saved successfully.",
            "is_competent": is_competent,
            "result_label": final_national["result"],
        }
    )
