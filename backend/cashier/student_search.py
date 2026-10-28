"""Cashier student lookup — pending and enrolled trainees (paid or unpaid)."""

from datetime import timedelta
from django.utils import timezone

from backend.registrar.pending_enrollment import (
    _profile_for_registration,
    _needed_status,
    pending_registration_queryset,
)
from backend.registrar.student_list import approved_students_queryset
from backend.student.models import StudentEnrollmentProfile, StudentRegistration
from backend.student.services import SCHOLARSHIP_TYPE_CHOICES

from .balance import fee_balance_for_profile
from .fees import payment_list_display

_SCHOLARSHIP_LABELS = dict(SCHOLARSHIP_TYPE_CHOICES)


def _full_name(first: str, middle: str, last: str) -> str:
    return " ".join(p for p in (first, middle, last) if p).strip()


def _search_tokens(query: str) -> list[str]:
    return [t for t in (query or "").strip().split() if t]


def _name_parts(first: str, middle: str, last: str) -> list[str]:
    words = []
    for part in (first, middle, last):
        if part:
            words.extend(part.split())
    return words


def _token_matches_name(token: str, first: str, middle: str, last: str) -> bool:
    t = token.lower()
    if not t:
        return False
    for word in _name_parts(first, middle, last):
        if word.lower().startswith(t):
            return True
    return False


def _matches_student_search(
    query: str,
    *,
    first: str,
    middle: str,
    last: str,
    email: str,
    reference_id: str,
) -> bool:
    tokens = _search_tokens(query)
    if not tokens:
        return False
    for token in tokens:
        t = token.lower()
        if _token_matches_name(t, first, middle, last):
            continue
        if t in (reference_id or "").lower():
            continue
        if t in (email or "").lower():
            continue
        return False
    return True


def _search_rank(query: str, first: str, middle: str, last: str) -> int:
    q = query.strip().lower()
    if not q:
        return 99
    if (first or "").lower().startswith(q):
        return 0
    for word in _name_parts(first, middle, last):
        if word.lower().startswith(q):
            return 1
    return 2


def _payment_label(reg: StudentRegistration, profile: StudentEnrollmentProfile | None) -> str:
    if not profile:
        return "Pending application"
    from backend.student.payment_records import profile_has_payment

    has_payment = profile_has_payment(profile)
    balance = fee_balance_for_profile(profile, profile.selected_program or reg.selected_program or "")
    if balance["totalRemaining"] > 0 and balance["totalPaid"] > 0:
        return f"Balance due: ₱{balance['totalRemaining']:,.2f}"
    if reg.status == StudentRegistration.Status.APPROVED:
        return "Payment: Paid" if balance["isFullyPaid"] or has_payment else "Enrolled — no payment proof"
    needed = _needed_status(profile, has_payment=has_payment, reg=reg)
    return needed["label"]


def _serialize_student(reg: StudentRegistration, profile: StudentEnrollmentProfile | None) -> dict:
    today = timezone.localtime(timezone.now()).date()

    if profile:
        name = _full_name(profile.first_name, profile.middle_name, profile.last_name)
        first_name = profile.first_name or reg.first_name
        last_name = profile.last_name or reg.last_name
        program = profile.selected_program or reg.selected_program
        email = profile.email or reg.email
        phone = profile.contact_number or reg.phone_number or ""
        profile_id = profile.pk
        scholarship_type = (profile.scholarship_type or "").strip()
        course_type = profile.program_type or reg.program_type or ""
        reg_date = profile.entry_date or (reg.created_at.date() if reg.created_at else today)
    else:
        name = _full_name(reg.first_name, reg.middle_name, reg.last_name)
        first_name = reg.first_name
        last_name = reg.last_name
        program = reg.selected_program
        email = reg.email
        phone = reg.phone_number or ""
        profile_id = None
        scholarship_type = ""
        course_type = reg.program_type or ""
        reg_date = reg.created_at.date() if reg.created_at else today

    program = (program or "").strip()

    # Determine if scholar
    has_grant = False
    if profile and hasattr(profile, "scholarship_grants"):
        has_grant = profile.scholarship_grants.exists()
    if not has_grant and hasattr(reg, "scholarship_grants"):
        has_grant = reg.scholarship_grants.exists()

    is_scholar = bool(
        (scholarship_type and scholarship_type.lower() not in ("", "none", "regular"))
        or has_grant
    )
    if is_scholar:
        stype_label = _SCHOLARSHIP_LABELS.get(scholarship_type.lower(), scholarship_type) if scholarship_type else "Scholar"
        scholarship_label = f"Scholar ({stype_label})" if stype_label != "Scholar" else "Scholar"
    else:
        scholarship_label = "Regular"

    # Course type display label
    if course_type == StudentRegistration.ProgramType.ASSESSMENT_ONLY:
        course_type_label = "Assessment Only"
    elif course_type == StudentRegistration.ProgramType.TRAINING_WITH_ASSESSMENT:
        course_type_label = "Training with Assessment"
    elif course_type:
        course_type_label = course_type.replace("_", " ").title()
    else:
        course_type_label = "Training with Assessment"

    balance = fee_balance_for_profile(profile, program)
    total_assessed = balance["totalAssessed"]
    total_paid = balance["totalPaid"]
    total_remaining = balance["totalRemaining"]
    is_fully_paid = balance["isFullyPaid"]

    # Calculate due date: 30 days after enrollment / last payment
    last_payment = None
    if profile:
        last_payment = profile.cashier_payments.order_by("-created_at").first()

    if last_payment:
        last_payment_date = timezone.localtime(last_payment.created_at).date()
        due_date = max(last_payment_date + timedelta(days=30), reg_date + timedelta(days=30))
    else:
        last_payment_date = None
        due_date = reg_date + timedelta(days=30)

    # Overdue and aging calculation
    days_overdue = (today - due_date).days if total_remaining > 0 else 0
    is_overdue = total_remaining > 0 and days_overdue > 0

    if total_remaining <= 0 and total_assessed > 0:
        payment_status = "Paid in Full"
        aging_bracket = "paid"
        aging_label = "Paid in Full"
    elif total_paid <= 0 and total_assessed > 0:
        payment_status = "Unpaid"
        if is_overdue:
            if days_overdue <= 30:
                aging_bracket = "1-30"
                aging_label = f"1–30 Days Overdue ({days_overdue}d)"
            elif days_overdue <= 60:
                aging_bracket = "31-60"
                aging_label = f"31–60 Days Overdue ({days_overdue}d)"
            elif days_overdue <= 90:
                aging_bracket = "61-90"
                aging_label = f"61–90 Days Overdue ({days_overdue}d)"
            else:
                aging_bracket = "90+"
                aging_label = f">90 Days Overdue ({days_overdue}d)"
        else:
            aging_bracket = "current"
            aging_label = "Current (Not Due)"
    elif total_paid > 0 and total_remaining > 0:
        payment_status = "Partial"
        if is_overdue:
            if days_overdue <= 30:
                aging_bracket = "1-30"
                aging_label = f"1–30 Days Overdue ({days_overdue}d)"
            elif days_overdue <= 60:
                aging_bracket = "31-60"
                aging_label = f"31–60 Days Overdue ({days_overdue}d)"
            elif days_overdue <= 90:
                aging_bracket = "61-90"
                aging_label = f"61–90 Days Overdue ({days_overdue}d)"
            else:
                aging_bracket = "90+"
                aging_label = f">90 Days Overdue ({days_overdue}d)"
        else:
            aging_bracket = "current"
            aging_label = "Current (Not Due)"
    else:
        payment_status = "Unpaid"
        aging_bracket = "current"
        aging_label = "Current (Not Due)"

    return {
        "id": profile_id,
        "studentId": reg.reference_id,
        "registrationId": str(reg.pk),
        "name": name,
        "firstName": first_name,
        "lastName": last_name,
        "program": program or "—",
        "courseType": course_type or "training_with_assessment",
        "courseTypeLabel": course_type_label,
        "email": email,
        "phone": phone,
        "referenceId": reg.reference_id,
        "isScholar": is_scholar,
        "scholarshipType": scholarship_type,
        "scholarshipLabel": scholarship_label,
        "paymentLabel": _payment_label(reg, profile),
        "feeLines": balance["feeLines"],
        "assessedFeeLines": balance["assessedFeeLines"],
        "totalAssessed": total_assessed,
        "totalPaid": total_paid,
        "totalRemaining": total_remaining,
        "isFullyPaid": is_fully_paid,
        "isNewStudent": total_paid <= 0 and total_assessed > 0,
        "paymentStatus": payment_status,
        "dueDate": due_date.isoformat(),
        "dueDateFormatted": due_date.strftime("%b %d, %Y"),
        "daysOverdue": max(0, days_overdue),
        "daysUntilDue": max(0, -days_overdue) if days_overdue <= 0 else 0,
        "isOverdue": is_overdue,
        "agingBracket": aging_bracket,
        "agingBracketLabel": aging_label,
        "registrationDate": reg_date.isoformat() if reg_date else "",
        "registrationDateFormatted": reg_date.strftime("%b %d, %Y") if reg_date else "",
    }


def _iter_cashier_students():
    """Pending + approved registrations (deduped by registration pk)."""
    seen: set = set()

    for reg in pending_registration_queryset():
        if reg.pk in seen:
            continue
        seen.add(reg.pk)
        profile = _profile_for_registration(reg)
        if profile and not hasattr(profile, "_proof_count"):
            profile = (
                StudentEnrollmentProfile.objects.filter(pk=profile.pk)
                .prefetch_related("payment_proofs", "cashier_payments", "scholarship_grants")
                .first()
            )
        yield reg, profile

    for reg in approved_students_queryset():
        if reg.pk in seen:
            continue
        seen.add(reg.pk)
        profile = _profile_for_registration(reg)
        if profile:
            profile = (
                StudentEnrollmentProfile.objects.filter(pk=profile.pk)
                .prefetch_related("payment_proofs", "cashier_payments", "scholarship_grants")
                .first()
            )
        yield reg, profile


def search_students(query: str, limit: int = 12) -> list[dict]:
    q = (query or "").strip()
    if len(q) < 2:
        return []

    limit = max(1, min(limit, 25))
    results = []

    for reg, profile in _iter_cashier_students():
        if profile:
            first, middle, last = profile.first_name, profile.middle_name, profile.last_name
            email = profile.email or reg.email
        else:
            first, middle, last = reg.first_name, reg.middle_name, reg.last_name
            email = reg.email

        if not _matches_student_search(
            q,
            first=first,
            middle=middle,
            last=last,
            email=email,
            reference_id=reg.reference_id,
        ):
            continue

        row = _serialize_student(reg, profile)
        row["_rank"] = _search_rank(q, first, middle, last)
        results.append(row)

    results.sort(key=lambda r: (r.pop("_rank", 99), r["name"].lower()))
    return results[:limit]


def list_students_for_cashier() -> list[dict]:
    rows = [_serialize_student(reg, profile) for reg, profile in _iter_cashier_students()]
    rows.sort(key=lambda r: r["name"].lower())
    return rows


def calculate_receivables_aging_summary(students: list[dict]) -> dict:
    total_receivables = 0.0
    total_assessed = 0.0
    total_paid = 0.0

    unpaid_count = 0
    unpaid_amount = 0.0

    partial_count = 0
    partial_amount = 0.0

    paid_full_count = 0
    paid_full_amount = 0.0

    overdue_count = 0
    overdue_amount = 0.0

    bracket_counts = {
        "current": 0,
        "1-30": 0,
        "31-60": 0,
        "61-90": 0,
        "90+": 0,
    }
    bracket_amounts = {
        "current": 0.0,
        "1-30": 0.0,
        "31-60": 0.0,
        "61-90": 0.0,
        "90+": 0.0,
    }

    course_types = set()
    courses = set()

    for s in students:
        rem = float(s.get("totalRemaining") or 0)
        assessed = float(s.get("totalAssessed") or 0)
        paid = float(s.get("totalPaid") or 0)

        total_receivables += rem
        total_assessed += assessed
        total_paid += paid

        status = s.get("paymentStatus")
        if status == "Unpaid":
            unpaid_count += 1
            unpaid_amount += rem
        elif status == "Partial":
            partial_count += 1
            partial_amount += rem
        elif status == "Paid in Full":
            paid_full_count += 1
            paid_full_amount += assessed

        if s.get("isOverdue"):
            overdue_count += 1
            overdue_amount += rem

        bracket = s.get("agingBracket")
        if bracket in bracket_counts:
            bracket_counts[bracket] += 1
            bracket_amounts[bracket] += rem

        ctype = s.get("courseType")
        if ctype:
            course_types.add(ctype)
        prog = s.get("program")
        if prog and prog != "—":
            courses.add(prog)

    collection_rate = round((total_paid / total_assessed * 100), 1) if total_assessed > 0 else 0.0

    return {
        "totalReceivables": round(total_receivables, 2),
        "totalAssessed": round(total_assessed, 2),
        "totalCollected": round(total_paid, 2),
        "collectionRate": collection_rate,
        "totalStudents": len(students),
        "activeReceivablesCount": sum(1 for s in students if (s.get("totalRemaining") or 0) > 0),
        "unpaid": {
            "count": unpaid_count,
            "amount": round(unpaid_amount, 2),
        },
        "partial": {
            "count": partial_count,
            "amount": round(partial_amount, 2),
        },
        "paidFull": {
            "count": paid_full_count,
            "amount": round(paid_full_amount, 2),
        },
        "overdue": {
            "count": overdue_count,
            "amount": round(overdue_amount, 2),
        },
        "brackets": {
            "current": {
                "label": "Current (0–30 Days)",
                "count": bracket_counts["current"],
                "amount": round(bracket_amounts["current"], 2),
            },
            "days1_30": {
                "label": "1–30 Days Overdue",
                "count": bracket_counts["1-30"],
                "amount": round(bracket_amounts["1-30"], 2),
            },
            "days31_60": {
                "label": "31–60 Days Overdue",
                "count": bracket_counts["31-60"],
                "amount": round(bracket_amounts["31-60"], 2),
            },
            "days61_90": {
                "label": "61–90 Days Overdue",
                "count": bracket_counts["61-90"],
                "amount": round(bracket_amounts["61-90"], 2),
            },
            "days90Plus": {
                "label": ">90 Days Overdue",
                "count": bracket_counts["90+"],
                "amount": round(bracket_amounts["90+"], 2),
            },
        },
        "courseTypes": sorted(list(course_types)),
        "courseOptions": sorted(list(courses)),
    }


def get_student_fees(registration_id: str) -> dict | None:
    try:
        reg = StudentRegistration.objects.get(pk=registration_id)
    except (StudentRegistration.DoesNotExist, ValueError):
        return None
    profile = _profile_for_registration(reg)
    if profile:
        program = profile.selected_program or reg.selected_program or ""
    else:
        program = reg.selected_program or ""
    balance = fee_balance_for_profile(profile, program)
    return {
        "registrationId": str(reg.pk),
        "program": program,
        "feeLines": balance["feeLines"],
        "assessedFeeLines": balance["assessedFeeLines"],
        "totalAssessed": balance["totalAssessed"],
        "totalPaid": balance["totalPaid"],
        "totalRemaining": balance["totalRemaining"],
        "isFullyPaid": balance["isFullyPaid"],
        "isNewStudent": balance["totalPaid"] <= 0 and balance["totalAssessed"] > 0,
        "paymentList": payment_list_display(),
    }
