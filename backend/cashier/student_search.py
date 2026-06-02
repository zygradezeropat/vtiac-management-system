"""Cashier student lookup — pending and enrolled trainees (paid or unpaid)."""

from backend.registrar.pending_enrollment import (
    _profile_for_registration,
    _needed_status,
    pending_registration_queryset,
)
from backend.registrar.student_list import approved_students_queryset
from backend.student.models import StudentEnrollmentProfile, StudentRegistration

from .balance import fee_balance_for_profile
from .fees import payment_list_display


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
    q = query.lower()
    allow_meta = "@" in q or any(ch.isdigit() for ch in q)
    for token in tokens:
        t = token.lower()
        if _token_matches_name(t, first, middle, last):
            continue
        if allow_meta and (
            t in (email or "").lower() or t in (reference_id or "").lower()
        ):
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
    if profile:
        name = _full_name(profile.first_name, profile.middle_name, profile.last_name)
        program = profile.selected_program or reg.selected_program
        email = profile.email or reg.email
        student_id = profile.pk
    else:
        name = _full_name(reg.first_name, reg.middle_name, reg.last_name)
        program = reg.selected_program
        email = reg.email
        student_id = None

    program = (program or "").strip()
    balance = fee_balance_for_profile(profile, program)
    return {
        "id": student_id,
        "registrationId": str(reg.pk),
        "name": name,
        "program": program or "—",
        "email": email,
        "referenceId": reg.reference_id,
        "paymentLabel": _payment_label(reg, profile),
        "feeLines": balance["feeLines"],
        "assessedFeeLines": balance["assessedFeeLines"],
        "totalAssessed": balance["totalAssessed"],
        "totalPaid": balance["totalPaid"],
        "totalRemaining": balance["totalRemaining"],
        "isFullyPaid": balance["isFullyPaid"],
        "isNewStudent": balance["totalPaid"] <= 0 and balance["totalAssessed"] > 0,
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
                .prefetch_related("payment_proofs")
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
                .prefetch_related("payment_proofs")
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
