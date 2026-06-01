"""Serialize cashier payments for dashboard / history / reports APIs."""

from datetime import date, datetime, timedelta
from django.db.models import Sum
from django.utils import timezone

from .models import CashierPayment


def _particulars_summary(particulars) -> str:
    if not particulars:
        return "—"
    first = particulars[0].get("description", "Payment") if isinstance(particulars[0], dict) else "Payment"
    if len(particulars) > 1:
        return f"{first} +{len(particulars) - 1} more"
    return first


def serialize_payment(payment: CashierPayment) -> dict:
    dt = timezone.localtime(payment.created_at)
    particulars = payment.particulars if isinstance(payment.particulars, list) else []
    return {
        "id": f"db-{payment.pk}",
        "serverPaymentId": payment.pk,
        "controlNumber": payment.control_number,
        "orNumber": payment.or_number or "",
        "receiptType": payment.receipt_type,
        "studentName": payment.student_name,
        "studentId": payment.profile_id,
        "registrationId": str(payment.registration_id) if payment.registration_id else None,
        "particulars": particulars,
        "totalPayable": float(payment.total_payable),
        "paidAmount": float(payment.paid_amount),
        "remainingBalance": float(payment.remaining_balance),
        "status": payment.status,
        "dateTime": dt.strftime("%b %d, %Y, %I:%M %p"),
        "createdAt": payment.created_at.isoformat(),
    }


def list_transactions(limit: int | None = None) -> list[dict]:
    qs = CashierPayment.objects.select_related("profile", "registration").order_by("-created_at")
    if limit:
        qs = qs[:limit]
    return [serialize_payment(p) for p in qs]


def _local_dt(dt):
    return timezone.localtime(dt) if timezone.is_aware(dt) else timezone.make_aware(dt)


def _sum_paid(qs) -> float:
    total = qs.aggregate(total=Sum("paid_amount"))["total"]
    return float(total or 0)


def _period_starts():
    now = timezone.localtime(timezone.now())
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today_start.replace(day=1)
    week_start = today_start - timedelta(days=now.weekday())
    year_start = today_start.replace(month=1, day=1)
    return today_start, month_start, week_start, year_start


def _parse_date_param(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None


def _range_bounds(start: date, end: date):
    """Inclusive calendar dates → aware datetimes for created_at filters."""
    tz = timezone.get_current_timezone()
    start_dt = timezone.make_aware(datetime.combine(start, datetime.min.time()), tz)
    end_dt = timezone.make_aware(datetime.combine(end, datetime.max.time()), tz)
    return start_dt, end_dt


def _payments_in_range(qs, start: date | None, end: date | None):
    if start and end:
        start_dt, end_dt = _range_bounds(start, end)
        return qs.filter(created_at__gte=start_dt, created_at__lte=end_dt)
    return qs


def _list_item(payment: CashierPayment) -> dict:
    return {
        "controlNumber": payment.control_number,
        "studentName": payment.student_name,
        "paidAmount": float(payment.paid_amount),
        "totalPayable": float(payment.total_payable),
        "remainingBalance": float(payment.remaining_balance),
        "status": payment.status,
        "dateTime": _local_dt(payment.created_at).strftime("%b %d, %Y, %I:%M %p"),
    }


def reports_summary(
    *,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    """Gross income + payment status breakdown from CashierPayment (paid_amount = collections)."""
    today_start, month_start, week_start, year_start = _period_starts()
    base = CashierPayment.objects.all()

    monthly_qs = base.filter(created_at__gte=month_start)
    weekly_qs = base.filter(created_at__gte=week_start)
    annual_qs = base.filter(created_at__gte=year_start)

    range_start = _parse_date_param(start_date) or month_start.date()
    range_end = _parse_date_param(end_date) or today_start.date()
    if range_start > range_end:
        range_start, range_end = range_end, range_start

    custom_qs = _payments_in_range(base, range_start, range_end)

    full_qs = base.filter(status=CashierPayment.Status.FULL)
    partial_qs = base.filter(status=CashierPayment.Status.PARTIAL)

    return {
        "monthlyIncome": _sum_paid(monthly_qs),
        "weeklyIncome": _sum_paid(weekly_qs),
        "annualIncome": _sum_paid(annual_qs),
        "totalIncome": _sum_paid(base),
        "customRange": {
            "startDate": range_start.isoformat(),
            "endDate": range_end.isoformat(),
            "income": _sum_paid(custom_qs),
            "transactionCount": custom_qs.count(),
        },
        "fullPayments": {
            "count": full_qs.count(),
            "amount": _sum_paid(full_qs),
            "items": [_list_item(p) for p in full_qs.order_by("-created_at")[:50]],
        },
        "partialPayments": {
            "count": partial_qs.count(),
            "amount": _sum_paid(partial_qs),
            "items": [_list_item(p) for p in partial_qs.order_by("-created_at")[:50]],
        },
        "totalRevenue": _sum_paid(base),
        "transactionCount": base.count(),
    }


def dashboard_stats() -> dict:
    payments = list(CashierPayment.objects.order_by("-created_at"))
    now = timezone.localtime(timezone.now())
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())

    total_collections = sum((p.paid_amount for p in payments), 0)
    today_count = sum(1 for p in payments if timezone.localtime(p.created_at) >= today_start)
    weekly_total = sum(
        p.paid_amount for p in payments if timezone.localtime(p.created_at) >= week_start
    )

    students_with_balance = set()
    for p in payments:
        if p.remaining_balance > 0:
            students_with_balance.add(p.student_name)

    return {
        "totalCollections": float(total_collections),
        "todayTransactions": today_count,
        "activeStudents": len(students_with_balance),
        "weeklyTotal": float(weekly_total),
        "recentTransactions": [serialize_payment(p) for p in payments[:5]],
        "transactionCount": len(payments),
    }
