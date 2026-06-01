"""Notifications when cashier records a student payment."""

from backend.core.models import PortalNotification
from backend.core.notification_service import create_notification, notify_users, registrar_users
from backend.student.enrollment_notifications import REGISTRAR_ENROLLMENT_URL, STUDENT_PAYMENTS_URL

from .models import CashierPayment


def _student_name(payment: CashierPayment) -> str:
    return payment.student_name or "Student"


def notify_payment_recorded(profile, payment: CashierPayment):
    """Notify student; notify registrars when payment was received (paid > 0)."""
    name = _student_name(payment)
    paid = payment.paid_amount
    total = payment.total_payable
    control = payment.control_number

    if paid > 0 and profile.user_id:
        if payment.status == CashierPayment.Status.FULL:
            msg = (
                f"Your payment of ₱{paid:,.2f} was recorded at the cashier "
                f"(Control No. {control}). Thank you — your account is fully paid for this billing."
            )
        else:
            msg = (
                f"Your payment of ₱{paid:,.2f} was recorded at the cashier "
                f"(Control No. {control}). Remaining balance: ₱{payment.remaining_balance:,.2f}."
            )
        create_notification(
            profile.user,
            category=PortalNotification.Category.PAYMENT_RECEIVED,
            title="Payment recorded",
            message=msg,
            link_url=STUDENT_PAYMENTS_URL,
            related_profile_id=profile.pk,
        )

    if paid > 0:
        notify_users(
            registrar_users(),
            category=PortalNotification.Category.PAYMENT_RECEIVED,
            title="Cashier payment received",
            message=(
                f"{name} paid ₱{paid:,.2f} at the cashier ({control}). "
                f"Status: {payment.status}. Total due: ₱{total:,.2f}."
            ),
            link_url=REGISTRAR_ENROLLMENT_URL,
            related_profile_id=profile.pk,
        )
