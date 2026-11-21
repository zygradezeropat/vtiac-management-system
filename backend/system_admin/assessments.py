"""Admin CRUD and public options for Assessment Programs (Assessment Only)."""

from decimal import Decimal, InvalidOperation

from django.db import transaction

from .defaults import DEFAULT_ASSESSMENTS
from .models import AssessmentProgram, seed_default_assessments


def _decimal(value, field_label: str) -> Decimal:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError):
        raise ValueError(f"{field_label} must be a valid amount.") from None
    if amount < 0:
        raise ValueError(f"{field_label} cannot be negative.")
    return amount


def _serialize_assessment(row: AssessmentProgram) -> dict:
    name = row.name
    nc_level = "other"
    if " NC III" in name:
        nc_level = "nc3"
    elif " NC II" in name:
        nc_level = "nc2"
    elif " NC I" in name:
        nc_level = "nc1"

    return {
        "id": row.pk,
        "name": row.name,
        "assessmentFee": float(row.assessment_fee),
        "sortOrder": row.sort_order,
        "isActive": row.is_active,
        "ncLevel": nc_level,
    }


def list_assessments() -> list[dict]:
    seed_default_assessments()
    return [
        _serialize_assessment(row)
        for row in AssessmentProgram.objects.order_by("sort_order", "name")
    ]


@transaction.atomic
def create_assessment(
    *,
    name: str,
    assessment_fee: Decimal | float | str | None = None,
    sort_order: int | None = None,
    is_active: bool = True,
) -> dict:
    label = (name or "").strip()
    if not label:
        raise ValueError("Assessment name is required.")
    if AssessmentProgram.objects.filter(name__iexact=label).exists():
        raise ValueError("An assessment program with this name already exists.")

    fee = _decimal(assessment_fee if assessment_fee is not None else 0, "Assessment fee")
    order = (
        int(sort_order)
        if sort_order not in (None, "")
        else (
            (
                AssessmentProgram.objects.order_by("-sort_order")
                .values_list("sort_order", flat=True)
                .first()
                or 0
            )
            + 1
        )
    )

    row = AssessmentProgram.objects.create(
        name=label,
        assessment_fee=fee,
        sort_order=max(order, 0),
        is_active=bool(is_active),
    )
    return _serialize_assessment(row)


@transaction.atomic
def update_assessment(
    assessment_id: int,
    *,
    name: str | None = None,
    assessment_fee: Decimal | float | str | None = None,
    sort_order: int | None = None,
    is_active: bool | None = None,
) -> dict:
    try:
        row = AssessmentProgram.objects.get(pk=assessment_id)
    except AssessmentProgram.DoesNotExist as exc:
        raise ValueError("Assessment program not found.") from exc

    update_fields = ["updated_at"]

    if name is not None:
        label = (name or "").strip()
        if not label:
            raise ValueError("Assessment name is required.")
        if (
            AssessmentProgram.objects.filter(name__iexact=label)
            .exclude(pk=row.pk)
            .exists()
        ):
            raise ValueError("An assessment program with this name already exists.")
        row.name = label
        update_fields.append("name")

    if assessment_fee is not None:
        row.assessment_fee = _decimal(assessment_fee, "Assessment fee")
        update_fields.append("assessment_fee")

    if sort_order is not None:
        row.sort_order = max(int(sort_order), 0)
        update_fields.append("sort_order")

    if is_active is not None:
        row.is_active = bool(is_active)
        update_fields.append("is_active")

    row.save(update_fields=update_fields)
    return _serialize_assessment(row)


@transaction.atomic
def delete_assessment(assessment_id: int) -> None:
    try:
        row = AssessmentProgram.objects.get(pk=assessment_id)
    except AssessmentProgram.DoesNotExist as exc:
        raise ValueError("Assessment program not found.") from exc
    row.delete()


def enrollment_assessment_options(*, include_inactive: bool = False) -> list[str]:
    seed_default_assessments()
    qs = AssessmentProgram.objects.all().order_by("sort_order", "name")
    if not include_inactive:
        qs = qs.filter(is_active=True)
    return list(qs.values_list("name", flat=True))


def assessment_fees_dict(*, include_inactive: bool = False) -> dict[str, Decimal]:
    seed_default_assessments()
    qs = AssessmentProgram.objects.all().order_by("sort_order", "name")
    if not include_inactive:
        qs = qs.filter(is_active=True)
    return {row.name: row.assessment_fee for row in qs}
