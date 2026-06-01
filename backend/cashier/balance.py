"""Running fee balance per student — assessed fees minus cashier payments (FIFO per line)."""

from decimal import Decimal

from backend.cashier.fees import fee_lines_for_program
from backend.student.models import StudentEnrollmentProfile


def _decimal(value) -> Decimal:
    return Decimal(str(value or 0))


def _normalize_desc(description: str) -> str:
    return " ".join((description or "").lower().split())


def _match_line_key(description: str, assessed_keys: list[str]) -> str | None:
    """Map a particular description to a canonical assessed fee line key."""
    norm = _normalize_desc(description)
    if not norm:
        return None

    for key in assessed_keys:
        if _normalize_desc(key) == norm:
            return key

    if "registration" in norm:
        for key in assessed_keys:
            if "registration" in _normalize_desc(key):
                return key

    for key in assessed_keys:
        key_norm = _normalize_desc(key)
        if key_norm in norm or norm in key_norm:
            return key

    return None


def _line_priority(key: str) -> int:
    if "registration" in _normalize_desc(key):
        return 0
    return 1


def _allocate_payment_fifo(
    particulars: list[dict],
    paid_amount: Decimal,
    assessed_keys: list[str],
) -> dict[str, Decimal]:
    """Apply paid_amount to particulars in registration-first order."""
    allocation = {key: Decimal("0") for key in assessed_keys}
    remaining = paid_amount

    rows: list[tuple[int, str, Decimal]] = []
    for item in particulars or []:
        desc = (item.get("description") or "").strip()
        amount = _decimal(item.get("amount"))
        if amount <= 0:
            continue
        key = _match_line_key(desc, assessed_keys)
        if not key:
            continue
        rows.append((_line_priority(key), key, amount))

    rows.sort(key=lambda row: (row[0], row[1]))

    for _, key, line_amount in rows:
        if remaining <= 0:
            break
        applied = min(remaining, line_amount)
        allocation[key] += applied
        remaining -= applied

    return allocation


def fee_balance_for_profile(
    profile: StudentEnrollmentProfile | None,
    program: str = "",
) -> dict:
    """
    Return assessed schedule, per-line paid/remaining, and totals.

    feeLines in the result are amounts still due (for cashier particulars).
    """
    assessed_lines = fee_lines_for_program(program)
    assessed_keys = [line["description"] for line in assessed_lines]
    assessed_map = {line["description"]: _decimal(line["amount"]) for line in assessed_lines}

    paid_on_line = {key: Decimal("0") for key in assessed_keys}

    if profile:
        for payment in profile.cashier_payments.order_by("created_at"):
            particulars = payment.particulars if isinstance(payment.particulars, list) else []
            paid = _decimal(payment.paid_amount)
            if paid <= 0:
                continue
            applied = _allocate_payment_fifo(particulars, paid, assessed_keys)
            for key, amount in applied.items():
                paid_on_line[key] += amount

    remaining_lines: list[dict] = []
    assessed_display: list[dict] = []

    for line in assessed_lines:
        key = line["description"]
        assessed = assessed_map.get(key, Decimal("0"))
        paid = paid_on_line.get(key, Decimal("0"))
        remaining = max(Decimal("0"), assessed - paid)

        assessed_display.append(
            {
                "description": key,
                "assessedAmount": float(assessed),
                "paidAmount": float(paid),
                "amount": float(remaining),
            }
        )

        if remaining > 0:
            remaining_lines.append(
                {
                    "description": key,
                    "amount": float(remaining),
                    "assessedAmount": float(assessed),
                    "paidAmount": float(paid),
                }
            )

    total_assessed = sum(assessed_map.values(), Decimal("0"))
    total_paid = sum(paid_on_line.values(), Decimal("0"))
    total_remaining = max(Decimal("0"), total_assessed - total_paid)

    return {
        "feeLines": remaining_lines,
        "assessedFeeLines": assessed_display,
        "totalAssessed": float(total_assessed),
        "totalPaid": float(total_paid),
        "totalRemaining": float(total_remaining),
        "isFullyPaid": total_remaining <= 0 and total_assessed > 0,
        "hasBalanceDue": total_remaining > 0,
    }
