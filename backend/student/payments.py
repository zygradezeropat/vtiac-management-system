"""Student payment information (portal display)."""

from decimal import Decimal

from .payment_proof import build_cashier_payment_rows, enrollment_form_section, payment_proof_section
from .payment_records import profile_cashier_paid_total, profile_has_payment

DEFAULT_FEE_LINES = (
    {"label": "Registration Fee", "amount": Decimal("1500.00")},
    {"label": "Training Fee", "amount": Decimal("10000.00")},
    {"label": "Assessment Fee", "amount": Decimal("3500.00")},
)


def format_peso(amount):
    return f"₱{amount:,.2f}"


def payment_statement(profile=None):
    from backend.cashier.balance import fee_balance_for_profile

    program = ""
    if profile:
        program = profile.selected_program or ""
        if profile.registration_id and profile.registration:
            program = program or profile.registration.selected_program or ""

    if profile and program:
        statement = fee_balance_for_profile(profile, program)
        lines = [
            {
                "label": item["description"],
                "amount_display": format_peso(Decimal(str(item["assessedAmount"]))),
                "paid_display": format_peso(Decimal(str(item["paidAmount"]))),
                "balance_display": format_peso(Decimal(str(item["amount"]))),
            }
            for item in statement["assessedFeeLines"]
        ]
        total_remaining = Decimal(str(statement["totalRemaining"]))
        return {
            "fee_lines": lines,
            "total_display": format_peso(Decimal(str(statement["totalAssessed"]))),
            "paid_display": format_peso(Decimal(str(statement["totalPaid"]))),
            "balance_display": format_peso(total_remaining),
            "total_remaining": total_remaining,
            "is_fully_paid": bool(statement.get("isFullyPaid")),
            "has_cashier_payments": bool(profile.cashier_payments.exists()),
        }

    raw_lines = []
    if profile:
        raw_lines = [
            {"description": item["label"], "amount": float(item["amount"])}
            for item in DEFAULT_FEE_LINES
        ]

    lines = [
        {
            "label": item["description"],
            "amount_display": format_peso(Decimal(str(item["amount"]))),
            "paid_display": format_peso(Decimal("0")),
            "balance_display": format_peso(Decimal(str(item["amount"]))),
        }
        for item in raw_lines
    ]
    total = sum(Decimal(str(item["amount"])) for item in raw_lines) if raw_lines else Decimal("0")
    paid = profile_cashier_paid_total(profile) if profile else Decimal("0")
    balance = max(Decimal("0"), total - paid)

    is_fully_paid = balance <= 0 and (paid > 0 or total <= 0)
    return {
        "fee_lines": lines,
        "total_display": format_peso(total),
        "paid_display": format_peso(paid),
        "balance_display": format_peso(balance),
        "total_remaining": balance,
        "is_fully_paid": is_fully_paid,
        "has_cashier_payments": bool(profile and profile.cashier_payments.exists()),
    }


def _payments_progress(profile):
    if not profile:
        return 25
    if profile_has_payment(profile):
        return 75
    if profile.profile_step_completed:
        return 50
    return 25


def student_payments_context(request):
    from .services import _student_portal_base, get_enrollment_profile

    profile = get_enrollment_profile(request.user)
    statement = payment_statement(profile)

    return _student_portal_base(
        request,
        active_menu="Payments",
        page_title="Payment Information",
        page_subtitle="View and manage your payment details.",
        progress_percent=_payments_progress(profile),
        cashier_payments=build_cashier_payment_rows(profile),
        **statement,
        **payment_proof_section(profile),
    )


def student_enrollment_pending_context(request):
    from .document_review import documents_cleared_for_payment
    from .enrollment_requirements import enrollment_progress_percent
    from .services import (
        _student_portal_base,
        can_edit_enrollment_application,
        enrollment_program_type_for_user,
        get_enrollment_profile,
        is_assessment_only_program,
    )

    profile = get_enrollment_profile(request.user)
    is_assessment_only = is_assessment_only_program(enrollment_program_type_for_user(request.user))
    awaiting_registrar = bool(profile and profile_has_payment(profile))
    documents_approved_can_pay = bool(
        profile
        and profile.requirements_submitted
        and documents_cleared_for_payment(profile)
        and not profile_has_payment(profile)
    )
    awaiting_document_approval = bool(
        profile
        and profile.requirements_submitted
        and not documents_cleared_for_payment(profile)
        and not profile_has_payment(profile)
    )

    return _student_portal_base(
        request,
        active_menu="Enrollment",
        page_title="Enrollment Process",
        page_subtitle="Complete your enrollment step by step",
        progress_percent=enrollment_progress_percent(profile),
        awaiting_registrar=awaiting_registrar,
        awaiting_document_approval=awaiting_document_approval,
        documents_approved_can_pay=documents_approved_can_pay,
        can_edit_enrollment=can_edit_enrollment_application(request.user),
        edit_profile_label=(
            "View / edit application form"
            if is_assessment_only
            else "View / edit learner profile"
        ),
        edit_requirements_label="View / edit uploaded requirements",
    )
