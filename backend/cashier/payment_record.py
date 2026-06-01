"""Record cashier payments and sync to the student portal."""

from decimal import Decimal, InvalidOperation

from django.db import transaction

from backend.student.models import StudentEnrollmentProfile, StudentRegistration

from .balance import fee_balance_for_profile
from .models import CashierPayment
from .notifications import notify_payment_recorded


def _parse_decimal(value, field_name: str) -> Decimal:
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError) as exc:
        raise ValueError(f"Invalid {field_name}.") from exc


def _resolve_profile(
    *,
    profile_id,
    registration_id,
) -> tuple[StudentEnrollmentProfile, StudentRegistration | None]:
    profile = None
    reg = None

    if profile_id:
        try:
            profile = StudentEnrollmentProfile.objects.select_related(
                "registration", "user"
            ).get(pk=int(profile_id))
        except (StudentEnrollmentProfile.DoesNotExist, ValueError, TypeError):
            raise ValueError("Student profile not found.") from None
        reg = profile.registration
        if not reg and profile.user_id:
            reg = getattr(profile.user, "registration_application", None)
        return profile, reg

    if registration_id:
        try:
            reg = StudentRegistration.objects.get(pk=registration_id)
        except (StudentRegistration.DoesNotExist, ValueError, TypeError):
            raise ValueError("Registration not found.") from None
        from backend.registrar.pending_enrollment import _profile_for_registration

        profile = _profile_for_registration(reg)
        if not profile:
            raise ValueError(
                "This student has no enrollment profile yet. Complete enrollment before recording payment."
            )
        return profile, reg

    raise ValueError("profile_id or registration_id is required.")


@transaction.atomic
def record_cashier_payment(*, user, payload: dict) -> dict:
    profile, reg = _resolve_profile(
        profile_id=payload.get("studentId") or payload.get("profile_id"),
        registration_id=payload.get("registrationId") or payload.get("registration_id"),
    )

    control_number = (payload.get("controlNumber") or "").strip()
    if not control_number:
        raise ValueError("Control number is required.")
    if CashierPayment.objects.filter(control_number=control_number).exists():
        raise ValueError(f"Control number {control_number} is already used.")

    particulars = payload.get("particulars") or []
    if not isinstance(particulars, list) or not particulars:
        raise ValueError("At least one particular is required.")

    cleaned_particulars = []
    for item in particulars:
        desc = (item.get("description") or "").strip()
        amount = _parse_decimal(item.get("amount", 0), "amount")
        if desc or amount > 0:
            cleaned_particulars.append({"description": desc, "amount": float(amount)})

    if not cleaned_particulars:
        raise ValueError("At least one particular is required.")

    total_payable = _parse_decimal(
        payload.get("totalPayable") or sum(p["amount"] for p in cleaned_particulars),
        "total payable",
    )
    paid_amount = _parse_decimal(payload.get("paidAmount", 0), "paid amount")
    if paid_amount <= 0:
        raise ValueError("Paid amount must be greater than zero.")

    program = profile.selected_program or (reg.selected_program if reg else "")
    balance_before = fee_balance_for_profile(profile, program)
    remaining_due = Decimal(str(balance_before["totalRemaining"]))

    if balance_before["totalAssessed"] > 0 and remaining_due > 0:
        if total_payable > remaining_due + Decimal("0.01"):
            raise ValueError(
                f"Total payable (₱{total_payable:,.2f}) exceeds the student's remaining "
                f"balance (₱{remaining_due:,.2f})."
            )

    remaining_balance = max(Decimal("0"), total_payable - paid_amount)

    status = (payload.get("status") or "").strip()
    valid_statuses = {choice[0] for choice in CashierPayment.Status.choices}
    if status not in valid_statuses:
        if paid_amount >= total_payable and total_payable > 0:
            status = CashierPayment.Status.FULL
        elif paid_amount > 0:
            status = CashierPayment.Status.PARTIAL
        else:
            status = CashierPayment.Status.UNPAID

    receipt_type = payload.get("receiptType") or CashierPayment.ReceiptType.INVOICE
    if receipt_type not in CashierPayment.ReceiptType.values:
        receipt_type = CashierPayment.ReceiptType.INVOICE

    student_name = (payload.get("studentName") or "").strip()
    if not student_name:
        student_name = f"{profile.first_name} {profile.last_name}".strip()

    payment = CashierPayment.objects.create(
        profile=profile,
        registration=reg,
        control_number=control_number,
        or_number=(payload.get("orNumber") or "").strip()[:64],
        receipt_type=receipt_type,
        student_name=student_name,
        particulars=cleaned_particulars,
        total_payable=total_payable,
        paid_amount=paid_amount,
        remaining_balance=remaining_balance,
        status=status,
        recorded_by=user if user.is_authenticated else None,
    )

    notify_payment_recorded(profile, payment)

    return {
        "id": payment.pk,
        "controlNumber": payment.control_number,
        "status": payment.status,
        "paidAmount": float(payment.paid_amount),
        "totalPayable": float(payment.total_payable),
        "remainingBalance": float(payment.remaining_balance),
        **fee_balance_for_profile(profile, program),
    }
