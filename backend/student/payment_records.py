"""Shared helpers — student payment proof + cashier payments."""

from decimal import Decimal

from django.db.models import Q, Sum

from .models import StudentEnrollmentProfile


def profile_has_payment(profile: StudentEnrollmentProfile | None, registration=None) -> bool:
    """True when the student has uploaded proof, cashier recorded payment, or balance is settled."""
    if not profile and not registration:
        return False

    # 1. Student uploaded payment proof files
    if profile and profile.payment_proofs.exists():
        return True

    # 2. Cashier recorded payments directly on profile
    if profile and profile.cashier_payments.exists():
        return True

    # 3. Cashier recorded payments on registration
    if registration and hasattr(registration, "cashier_payments") and registration.cashier_payments.exists():
        return True

    # 4. Check CashierPayment via registration_id cross-reference
    reg_id = getattr(registration, "pk", None) or getattr(profile, "registration_id", None)
    if reg_id:
        from backend.cashier.models import CashierPayment
        q = Q(registration_id=reg_id)
        if profile:
            q |= Q(profile=profile)
        if CashierPayment.objects.filter(q).exists():
            return True

    # 5. Check if fee balance is already settled or fully covered by scholarship grant
    try:
        from backend.cashier.balance import fee_balance_for_profile
        prog = (profile.selected_program if profile else "") or (registration.selected_program if registration else "")
        bal = fee_balance_for_profile(profile, prog)
        if bal.get("isFullyPaid") or Decimal(str(bal.get("totalRemaining", 1))) <= Decimal("0"):
            if Decimal(str(bal.get("totalPaid", 0))) > Decimal("0") or (profile and profile.cashier_payments.exists()):
                return True
    except Exception:
        pass

    return False


def profile_cashier_paid_total(profile: StudentEnrollmentProfile | None) -> Decimal:
    if not profile:
        return Decimal("0")
    agg = profile.cashier_payments.aggregate(total=Sum("paid_amount"))
    return agg["total"] or Decimal("0")


def dashboard_payment_display(profile, registration=None):
    """Read-only payment card on the student dashboard."""
    empty = {
        "payment_status": "—",
        "payment_badge": "—",
        "payment_badge_class": "student-badge--progress",
    }
    if not profile or not profile.requirements_submitted:
        return empty

    from .models import StudentRegistration
    from .payments import payment_statement

    statement = payment_statement(profile)
    has_payment = profile_has_payment(profile)
    approved = bool(
        registration and registration.status == StudentRegistration.Status.APPROVED
    )
    fully_paid = bool(statement.get("is_fully_paid"))
    remaining = statement.get("total_remaining")

    if approved or fully_paid:
        return {
            "payment_status": "Paid",
            "payment_badge": "Paid",
            "payment_badge_class": "student-badge--paid",
        }
    if has_payment and remaining is not None and remaining > 0:
        return {
            "payment_status": "Partially paid",
            "payment_badge": "Partial",
            "payment_badge_class": "student-badge--progress",
        }
    if has_payment:
        return {
            "payment_status": "Paid",
            "payment_badge": "Paid",
            "payment_badge_class": "student-badge--paid",
        }
    return {
        "payment_status": "Pending",
        "payment_badge": "Unpaid",
        "payment_badge_class": "student-badge--unpaid",
    }
