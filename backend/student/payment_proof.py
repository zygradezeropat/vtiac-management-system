"""Proof of payment uploads on the student payments panel."""

from django.utils import timezone

from .enrollment_requirements import _validate_upload_file
from .models import StudentEnrollmentProfile, StudentPaymentProof


def enrollment_form_section(profile):
    """Enrollment form card — always shown; status drives proof-of-payment unlock."""
    complete = bool(profile and profile.profile_step_completed)
    return {
        "enrollment_form_complete": complete,
        "enrollment_form_started": profile is not None,
        "enrollment_form_program": profile.selected_program if profile else "",
        "enrollment_form_updated": (
            profile.updated_at.strftime("%B %d, %Y") if profile and complete else ""
        ),
        "enrollment_form_status_label": "Complete" if complete else "Incomplete",
        "enrollment_form_status_class": "success" if complete else "warning",
    }


def build_payment_proof_rows(profile):
    if not profile:
        return []
    rows = []
    for proof in profile.payment_proofs.all():
        filename = proof.original_filename or proof.file.name.split("/")[-1]
        rows.append(
            {
                "id": proof.pk,
                "filename": filename,
                "file_url": proof.file.url if proof.file else "",
                "reference_note": proof.reference_note,
                "uploaded_display": timezone.localtime(proof.uploaded_at).strftime(
                    "%B %d, %Y · %I:%M %p"
                ),
            }
        )
    return rows


def save_payment_proof(profile, uploaded_file, reference_note=""):
    if not profile:
        raise ValueError("Complete your enrollment form before uploading proof of payment.")
    if not profile.profile_step_completed:
        raise ValueError(
            "Complete your Learner's Profile Form (enrollment) before uploading proof of payment."
        )

    error = _validate_upload_file(uploaded_file)
    if error:
        raise ValueError(error)

    note = (reference_note or "").strip()[:128]
    return StudentPaymentProof.objects.create(
        profile=profile,
        file=uploaded_file,
        original_filename=getattr(uploaded_file, "name", "") or "",
        reference_note=note,
    )


def build_cashier_payment_rows(profile):
    if not profile:
        return []
    rows = []
    for payment in profile.cashier_payments.order_by("-created_at"):
        particulars = payment.particulars or []
        summary = particulars[0].get("description", "Payment") if particulars else "Payment"
        if len(particulars) > 1:
            summary = f"{summary} +{len(particulars) - 1} more"
        rows.append(
            {
                "control_number": payment.control_number,
                "or_number": payment.or_number,
                "status": payment.status,
                "paid_display": f"₱{payment.paid_amount:,.2f}",
                "total_display": f"₱{payment.total_payable:,.2f}",
                "balance_display": f"₱{payment.remaining_balance:,.2f}",
                "particulars_summary": summary,
                "recorded_display": timezone.localtime(payment.created_at).strftime(
                    "%B %d, %Y · %I:%M %p"
                ),
            }
        )
    return rows


def payment_proof_section(profile):
    from .payment_records import profile_has_payment

    form = enrollment_form_section(profile)
    can_upload = form["enrollment_form_complete"]
    return {
        **form,
        "can_upload_payment_proof": can_upload,
        "payment_proofs": build_payment_proof_rows(profile),
        "has_payment_proofs": bool(profile and profile.payment_proofs.exists()),
        "has_payment_on_file": profile_has_payment(profile),
    }
