"""Shared helpers — student payment proof + cashier payments."""

from decimal import Decimal

from django.db.models import Sum

from .models import StudentEnrollmentProfile


def profile_has_payment(profile: StudentEnrollmentProfile | None) -> bool:
    """True when the student has uploaded proof or cashier recorded payment (paid > 0)."""
    if not profile:
        return False
    if profile.payment_proofs.exists():
        return True
    return profile.cashier_payments.filter(paid_amount__gt=0).exists()


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
