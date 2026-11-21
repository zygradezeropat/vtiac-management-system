"""Admin CRUD and public options for Assessment Programs (Assessment Only)."""

from decimal import Decimal, InvalidOperation

from django.db import transaction

from .defaults import DEFAULT_ASSESSMENTS
from .models import AssessmentProgram, ProgramCompetency, seed_default_assessments


def _decimal(value, field_label: str) -> Decimal:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError):
        raise ValueError(f"{field_label} must be a valid amount.") from None
    if amount < 0:
        raise ValueError(f"{field_label} cannot be negative.")
    return amount


def _serialize_competency(comp: ProgramCompetency) -> dict:
    return {
        "id": comp.id,
        "category": comp.category,
        "categoryLabel": comp.get_category_display(),
        "code": comp.code,
        "title": comp.title,
        "nominalHours": comp.nominal_hours,
        "sortOrder": comp.sort_order,
        "learningOutcomes": comp.learning_outcomes or [],
        "isActive": comp.is_active,
    }


def _serialize_assessment(row: AssessmentProgram, include_competencies: bool = False) -> dict:
    name = row.name
    nc_level = "other"
    if " NC III" in name:
        nc_level = "nc3"
    elif " NC II" in name:
        nc_level = "nc2"
    elif " NC I" in name:
        nc_level = "nc1"

    comps = list(row.competencies.all().order_by("category", "sort_order", "id"))
    basic_count = sum(1 for c in comps if c.category == ProgramCompetency.Category.BASIC and c.is_active)
    common_count = sum(1 for c in comps if c.category == ProgramCompetency.Category.COMMON and c.is_active)
    core_count = sum(1 for c in comps if c.category == ProgramCompetency.Category.CORE and c.is_active)

    data = {
        "id": row.pk,
        "name": row.name,
        "assessmentFee": float(row.assessment_fee),
        "sortOrder": row.sort_order,
        "isActive": row.is_active,
        "ncLevel": nc_level,
        "basicCount": basic_count,
        "commonCount": common_count,
        "coreCount": core_count,
        "totalCompetencies": basic_count + common_count + core_count,
    }
    if include_competencies:
        data["competencies"] = [_serialize_competency(c) for c in comps]
    return data


def list_assessments(include_competencies: bool = True) -> list[dict]:
    seed_default_assessments()
    return [
        _serialize_assessment(row, include_competencies=include_competencies)
        for row in AssessmentProgram.objects.prefetch_related("competencies").order_by("sort_order", "name")
    ]


@transaction.atomic
def create_assessment(
    *,
    name: str,
    assessment_fee: Decimal | float | str | None = None,
    sort_order: int | None = None,
    is_active: bool = True,
    competencies: list[dict] | None = None,
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

    if competencies and isinstance(competencies, list):
        save_assessment_competencies(row.pk, competencies)

    return _serialize_assessment(row, include_competencies=True)


@transaction.atomic
def update_assessment(
    assessment_id: int,
    *,
    name: str | None = None,
    assessment_fee: Decimal | float | str | None = None,
    sort_order: int | None = None,
    is_active: bool | None = None,
    competencies: list[dict] | None = None,
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

    if competencies is not None and isinstance(competencies, list):
        save_assessment_competencies(row.pk, competencies)

    return _serialize_assessment(row, include_competencies=True)


@transaction.atomic
def delete_assessment(assessment_id: int) -> None:
    try:
        row = AssessmentProgram.objects.get(pk=assessment_id)
    except AssessmentProgram.DoesNotExist as exc:
        raise ValueError("Assessment program not found.") from exc
    row.delete()


def list_assessment_competencies(assessment_id: int) -> list[dict]:
    try:
        assessment = AssessmentProgram.objects.get(pk=assessment_id)
    except AssessmentProgram.DoesNotExist as exc:
        raise ValueError("Assessment program not found.") from exc

    comps = assessment.competencies.all().order_by("category", "sort_order", "id")
    return [_serialize_competency(c) for c in comps]


@transaction.atomic
def save_assessment_competencies(assessment_id: int, competencies_data: list[dict]) -> list[dict]:
    try:
        assessment = AssessmentProgram.objects.get(pk=assessment_id)
    except AssessmentProgram.DoesNotExist as exc:
        raise ValueError("Assessment program not found.") from exc

    assessment.competencies.all().delete()
    to_create = []
    for idx, item in enumerate(competencies_data, start=1):
        title = (item.get("title") or "").strip()
        if not title:
            continue
        category = (item.get("category") or "core").strip().lower()
        if category not in (
            ProgramCompetency.Category.BASIC,
            ProgramCompetency.Category.COMMON,
            ProgramCompetency.Category.CORE,
        ):
            category = ProgramCompetency.Category.CORE

        code = (item.get("code") or "").strip()
        nominal_hours = int(item.get("nominal_hours") or item.get("nominalHours") or 0)
        sort_order = int(item.get("sort_order") or item.get("sortOrder") or idx)
        learning_outcomes = item.get("learning_outcomes") or item.get("learningOutcomes") or []
        if isinstance(learning_outcomes, str):
            learning_outcomes = [line.strip() for line in learning_outcomes.split("\n") if line.strip()]

        to_create.append(
            ProgramCompetency(
                assessment=assessment,
                category=category,
                code=code,
                title=title,
                nominal_hours=max(0, nominal_hours),
                sort_order=sort_order,
                learning_outcomes=learning_outcomes,
                is_active=bool(item.get("is_active", item.get("isActive", True))),
            )
        )

    if to_create:
        ProgramCompetency.objects.bulk_create(to_create)

    comps = assessment.competencies.all().order_by("category", "sort_order", "id")
    return [_serialize_competency(c) for c in comps]


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
