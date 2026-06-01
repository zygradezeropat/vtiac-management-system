"""Cashier JSON API."""

import json

from django.contrib.auth.decorators import login_required
from django.core.cache import cache
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_http_methods

from backend.accounts.services import require_portal_access

from .payment_record import record_cashier_payment
from .services import CASHIER_ROLE
from .fees import payment_list_display
from .student_search import get_student_fees, list_students_for_cashier, search_students
from .transactions import dashboard_stats, list_transactions, reports_summary

CONTROL_NUMBER_CACHE_KEY = "cashier_control_number_seq"


def _format_control_number(seq: int) -> str:
    return f"CN-{seq:04d}"


def _next_control_sequence() -> int:
    """Atomically reserve the next control number sequence (shared across cashiers)."""
    try:
        return cache.incr(CONTROL_NUMBER_CACHE_KEY)
    except ValueError:
        cache.set(CONTROL_NUMBER_CACHE_KEY, 1, timeout=None)
        return 1


@login_required(login_url="/")
@require_GET
def students_search(request):
    denied = require_portal_access(request, CASHIER_ROLE)
    if denied:
        return denied

    query = request.GET.get("q", "")
    students = search_students(query)
    return JsonResponse({"students": students})


@login_required(login_url="/")
@require_GET
def students_list(request):
    denied = require_portal_access(request, CASHIER_ROLE)
    if denied:
        return denied

    return JsonResponse({"students": list_students_for_cashier()})


@login_required(login_url="/")
@require_GET
def student_fees(request):
    denied = require_portal_access(request, CASHIER_ROLE)
    if denied:
        return denied

    registration_id = request.GET.get("registration_id", "")
    payload = get_student_fees(registration_id)
    if not payload:
        return JsonResponse({"error": "Student not found."}, status=404)
    return JsonResponse(payload)


@login_required(login_url="/")
@require_GET
def fee_schedule(request):
    denied = require_portal_access(request, CASHIER_ROLE)
    if denied:
        return denied

    return JsonResponse({"paymentList": payment_list_display()})


@login_required(login_url="/")
@require_GET
def payments_list(request):
    denied = require_portal_access(request, CASHIER_ROLE)
    if denied:
        return denied

    return JsonResponse({"transactions": list_transactions()})


@login_required(login_url="/")
@require_GET
def reports_data(request):
    denied = require_portal_access(request, CASHIER_ROLE)
    if denied:
        return denied

    return JsonResponse(
        reports_summary(
            start_date=request.GET.get("start_date"),
            end_date=request.GET.get("end_date"),
        )
    )


@login_required(login_url="/")
@require_GET
def dashboard_data(request):
    denied = require_portal_access(request, CASHIER_ROLE)
    if denied:
        return denied

    return JsonResponse(dashboard_stats())


@login_required(login_url="/")
@require_http_methods(["POST"])
def record_payment(request):
    denied = require_portal_access(request, CASHIER_ROLE)
    if denied:
        return denied

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    try:
        result = record_cashier_payment(user=request.user, payload=payload)
        return JsonResponse({"ok": True, "payment": result})
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)


@login_required(login_url="/")
@require_GET
def next_control_number(request):
    denied = require_portal_access(request, CASHIER_ROLE)
    if denied:
        return denied

    seq = _next_control_sequence()
    return JsonResponse({"controlNumber": _format_control_number(seq)})
