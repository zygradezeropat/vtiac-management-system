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


def institutional_reports_payload() -> dict:
    egace_batch = _egace_batch_report_payload()
    return {
        "generatedAt": timezone.localtime().strftime("%Y-%m-%d %I:%M %p"),
        "enrollment": _enrollment_report(),
        "payments": _payment_report(),
        "performance": _performance_report(),
        "egace": egace_batch,
        "egaceBatchReport": egace_batch,
        "programs": enrollment_program_options(),
    }
