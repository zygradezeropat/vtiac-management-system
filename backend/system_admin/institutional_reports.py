"""Consolidated institutional reporting payload for the admin Reports Center."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, time
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone

from backend.cashier.models import CashierPayment
from backend.registrar.pending_enrollment import pending_enrollment_count
from backend.student.models import StudentRegistration
from backend.system_admin.dashboard_stats import (
    _egace_batch_report_payload,
    _enrolled_by_program,
)
from backend.system_admin.program_config import enrollment_program_options
from backend.trainer.egace_progress import build_registrar_egace_rows
from backend.trainer.models import TrainerStudentGrade


def _money_display(value) -> str:
    amount = Decimal(str(value or 0))
    return f"₱{amount:,.2f}"


def _enrollment_report() -> dict:
    by_status = (
        StudentRegistration.objects.values("status")
        .annotate(count=Count("id"))
        .order_by("status")
    )
    status_rows = [
        {"status": row["status"], "count": row["count"]} for row in by_status
    ]
    enrolled_by_program = [
        {"program": program, "count": count}
        for program, count in sorted(_enrolled_by_program().items(), key=lambda x: (-x[1], x[0]))
    ]
    return {
        "pendingApprovals": pending_enrollment_count(),
        "totalApproved": StudentRegistration.objects.filter(
            status=StudentRegistration.Status.APPROVED
        ).count(),
        "byStatus": status_rows,
        "byProgram": enrolled_by_program,
    }


def _payment_report() -> dict:
    payments = CashierPayment.objects.all()
    totals = payments.aggregate(
        total_amount=Sum("paid_amount"),
        count=Count("id"),
    )
    today = timezone.localdate()
    start = timezone.make_aware(datetime.combine(today, time.min))
    today_total = (
        payments.filter(created_at__gte=start).aggregate(total=Sum("paid_amount"))["total"]
        or 0
    )
    recent = []
    for payment in payments.select_related("profile", "registration", "recorded_by").order_by(
        "-created_at"
    ):
        name = "—"
        if payment.profile_id:
            name = f"{payment.profile.first_name} {payment.profile.last_name}".strip()
        elif payment.registration_id:
            name = f"{payment.registration.first_name} {payment.registration.last_name}".strip()
        recent.append(
            {
                "date": timezone.localtime(payment.created_at).strftime("%Y-%m-%d %I:%M %p"),
                "student": name or "—",
                "amount": _money_display(payment.paid_amount),
                "type": payment.receipt_type or "—",
                "cashier": (
                    payment.recorded_by.get_full_name() if payment.recorded_by_id else "—"
                ),
            }
        )
    return {
        "transactionCount": totals["count"] or 0,
        "totalCollected": _money_display(totals["total_amount"]),
        "collectedToday": _money_display(today_total),
        "recent": recent,
    }


def _performance_report() -> dict:
    grade_count = TrainerStudentGrade.objects.count()
    programs = defaultdict(lambda: {"students": 0, "withGrades": 0, "assessed": 0})
    for grade in TrainerStudentGrade.objects.only("program", "payload"):
        program = (grade.program or "Unspecified").strip()
        programs[program]["withGrades"] += 1
        payload = grade.payload if isinstance(grade.payload, dict) else {}
        national = payload.get("national_assessment") or {}
        result = (national.get("result") or "").strip().lower()
        if result in {"competent", "passed"}:
            programs[program]["assessed"] += 1

    egace_rows = build_registrar_egace_rows()
    for row in egace_rows:
        program = (row.get("course") or "Unspecified").strip()
        programs[program]["students"] += 1

    program_rows = [
        {
            "program": name,
            "students": data["students"],
            "withGrades": data["withGrades"],
            "assessed": data["assessed"],
        }
        for name, data in sorted(programs.items(), key=lambda x: x[0].lower())
    ]
    return {
        "gradeRecords": grade_count,
        "programRows": program_rows,
    }


def _all_batches_egace_report() -> list[dict]:
    from backend.registrar.models import RegistrarScheduleTemplate

    egace_rows = build_registrar_egace_rows()
    batches_qs = RegistrarScheduleTemplate.objects.all().order_by("course_name", "id")

    course_batch_counters = {}
    institutional_batches = []

    for t in batches_qs:
        c_name = t.course_name or "General Training"
        course_batch_counters[c_name] = course_batch_counters.get(c_name, 0) + 1
        batch_num = course_batch_counters[c_name]

        raw_name = (t.name or "").strip()
        clean_batch = raw_name if raw_name else f"Batch {batch_num}"

        t_students = t.students_snapshot if isinstance(t.students_snapshot, list) else []
        t_refs = {s.get("referenceId") for s in t_students if s.get("referenceId")}
        t_names = {s.get("fullName", "").strip().lower() for s in t_students if s.get("fullName")}
        matched_egace = [
            r
            for r in egace_rows
            if r.get("referenceId") in t_refs
            or r.get("studentName", "").strip().lower() in t_names
        ]

        has_scholar = any(
            s.get("scholarship") or s.get("scholarshipType") or s.get("scholarship_type")
            for s in t_students
        )
        modality = "SCHOLARS" if has_scholar else "NON-SCHOLARS"

        start_iso = (
            t.available_from.strftime("%Y-%m-%d")
            if t.available_from
            else (t.created_at.strftime("%Y-%m-%d") if t.created_at else "")
        )
        end_iso = t.available_until.strftime("%Y-%m-%d") if t.available_until else ""
        b_year = (
            t.available_from.year
            if t.available_from
            else (t.created_at.year if t.created_at else 2026)
        )
        b_month = (
            t.available_from.month
            if t.available_from
            else (t.created_at.month if t.created_at else 11)
        )

        institutional_batches.append(
            {
                "id": t.id,
                "course_name": c_name,
                "batch_label": clean_batch,
                "full_batch_label": (
                    t.batch_label
                    or f"{t.academic_year or 'AY 2026–2027'} · {clean_batch}"
                ),
                "modality": modality,
                "trainer_name": (
                    t.trainer_name
                    or (t.trainer_request.full_name if t.trainer_request else "Unassigned")
                ),
                "examiner_name": t.examiner_name or "TESDA Assessor",
                "start_date": (
                    t.available_from.strftime("%m/%d/%Y") if t.available_from else "—"
                ),
                "end_date": (
                    t.available_until.strftime("%m/%d/%Y") if t.available_until else "—"
                ),
                "start_date_iso": start_iso,
                "end_date_iso": end_iso,
                "year": b_year,
                "month": b_month,
                "academic_year": t.academic_year or "AY 2026–2027",
                "term": t.term or "1st Semester",
                "schedule": (
                    f"{t.schedule_type.capitalize()} {t.time_from}–{t.time_to}"
                    if t.schedule_type
                    else "TBA"
                ),
                "status": t.get_status_display(),
                "students_count": len(t_students),
                "graduates": sum(1 for r in matched_egace if r.get("graduate")),
                "assessed": sum(1 for r in matched_egace if r.get("assessment")),
                "certified": sum(1 for r in matched_egace if r.get("certificate")),
                "employed": sum(1 for r in matched_egace if r.get("employment")),
            }
        )

    return institutional_batches


def _trainer_evaluations_report() -> dict:
    from django.contrib.auth import get_user_model
    from django.db.models import Avg
    from backend.core.models import StaffProfile
    from backend.trainer.models import TrainerEvaluation

    User = get_user_model()
    trainers = User.objects.filter(
        staff_profile__role=StaffProfile.Role.TRAINER
    ).order_by("first_name", "last_name")
    total_evals = TrainerEvaluation.objects.count()
    avg_res = TrainerEvaluation.objects.aggregate(avg=Avg("overall_rating"))["avg"]
    avg_rating_display = f"{avg_res:.1f} ★" if avg_res is not None else "—"

    trainer_list = []
    for t in trainers:
        t_evals = TrainerEvaluation.objects.filter(trainer=t)
        t_count = t_evals.count()
        t_avg = t_evals.aggregate(avg=Avg("overall_rating"))["avg"] if t_count > 0 else None

        assigned_prog = ""
        assigned_batch = ""
        if t_evals.exists():
            first_ev = t_evals.first()
            assigned_prog = first_ev.course_name
            assigned_batch = first_ev.batch_label

        trainer_list.append(
            {
                "name": t.get_full_name() or t.username,
                "email": t.email,
                "program": assigned_prog or "Assigned TVET Instructor",
                "batch": assigned_batch or "Active Batches",
                "evalCount": t_count,
                "avgRating": round(float(t_avg), 1) if t_avg is not None else None,
                "ratingDisplay": f"{t_avg:.1f} ★" if t_avg is not None else "No evaluations",
            }
        )

    return {
        "totalEvaluations": total_evals,
        "averageRating": avg_rating_display,
        "trainers": trainer_list,
    }


def institutional_reports_payload() -> dict:
    egace_batch = _egace_batch_report_payload()
    return {
        "generatedAt": timezone.localtime().strftime("%Y-%m-%d %I:%M %p"),
        "enrollment": _enrollment_report(),
        "payments": _payment_report(),
        "performance": _performance_report(),
        "egace": egace_batch,
        "egaceBatchReport": egace_batch,
        "batches": _all_batches_egace_report(),
        "trainerEvaluations": _trainer_evaluations_report(),
        "programs": enrollment_program_options(),
    }
