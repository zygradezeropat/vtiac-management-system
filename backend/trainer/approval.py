"""Trainer account requests — pending list and approve/reject (admin + registrar)."""

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction

from backend.core.models import StaffAccountProfile, StaffProfile

from .models import TrainerAccountRequest

User = get_user_model()


def pending_trainer_requests_queryset():
    return TrainerAccountRequest.objects.filter(
        status=TrainerAccountRequest.Status.PENDING
    ).order_by("-created_at")


def pending_trainer_requests_count() -> int:
    return pending_trainer_requests_queryset().count()


def _experience_label(value: str) -> str:
    mapping = dict(TrainerAccountRequest.ExperienceRange.choices)
    return mapping.get(value, value or "—")


def serialize_trainer_request(req: TrainerAccountRequest) -> dict:
    full_name = " ".join(
        part for part in [req.first_name, req.middle_name, req.last_name] if part
    ).strip() or req.email
    qualifications = req.qualifications if isinstance(req.qualifications, list) else []
    if req.other_qualification:
        qualifications = [*qualifications, f"Other: {req.other_qualification}"]
    qualifications = [q for q in qualifications if q]
    return {
        "id": str(req.id),
        "referenceId": req.reference_id,
        "name": full_name,
        "email": req.email,
        "phone": req.phone_number,
        "specializations": qualifications,
        "accountType": "Trainer Applicant",
        "accountTypeBadgeClass": "registrar-enrollment-scholarship",
        "status": "Pending trainer account",
        "submittedDate": req.created_at.strftime("%Y-%m-%d") if req.created_at else "",
        "documentsStatus": "complete",
        "missingDocuments": [],
        "highestNc": req.highest_tesda_nc or "—",
        "yearsExperience": _experience_label(req.years_experience),
        "remarks": req.remarks or "",
        "adminApproval": None,
    }


def pending_trainer_requests_payload():
    return [serialize_trainer_request(req) for req in pending_trainer_requests_queryset()]


def get_pending_trainer_request(request_id: str):
    try:
        return pending_trainer_requests_queryset().get(pk=request_id)
    except TrainerAccountRequest.DoesNotExist:
        return None
    except (ValueError, TypeError):
        return None


def create_trainer_user_from_request(req: TrainerAccountRequest):
    if User.objects.filter(email__iexact=req.email).exists():
        raise ValueError("A user with this email already exists.")

    with transaction.atomic():
        user = User.objects.create(
            username=req.email,
            email=req.email,
            first_name=" ".join(
                part for part in [req.first_name, req.middle_name] if part
            ).strip(),
            last_name=req.last_name,
            password=req.password_hash,
            is_active=True,
            is_staff=True,
        )
        StaffProfile.objects.create(user=user, role=StaffProfile.Role.TRAINER)
        StaffAccountProfile.objects.update_or_create(
            user=user,
            defaults={"phone_number": req.phone_number},
        )
    return user


def approve_trainer_request(req: TrainerAccountRequest) -> None:
    create_trainer_user_from_request(req)
    req.status = TrainerAccountRequest.Status.APPROVED
    req.save(update_fields=["status"])


def reject_trainer_request(req: TrainerAccountRequest) -> None:
    req.status = TrainerAccountRequest.Status.REJECTED
    req.save(update_fields=["status"])
