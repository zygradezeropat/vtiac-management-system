"""Admin CRUD for NC programs and portal system settings."""

from decimal import Decimal, InvalidOperation

from django.db import transaction

from .models import NcProgram, ProgramCompetency, SystemSettings, seed_default_programs
from .program_config import clear_program_config_cache


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


def _serialize_program(row: NcProgram, include_competencies: bool = False) -> dict:
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
        "trainingFee": float(row.training_fee),
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


def _serialize_settings(settings: SystemSettings) -> dict:
    return {
        "fiscalYearLabel": settings.fiscal_year_label,
        "registrationFee": float(settings.registration_fee),
        "enrollmentOpen": settings.enrollment_open,
    }


def system_settings_payload() -> dict:
    from .schedules import list_schedules

    seed_default_programs()
    settings = SystemSettings.load()
    programs = [
        _serialize_program(row, include_competencies=True)
        for row in NcProgram.objects.prefetch_related("competencies").order_by("sort_order", "name")
    ]
    schedules = list_schedules()
    return {
        "settings": _serialize_settings(settings),
        "programs": programs,
        "schedules": schedules,
    }


@transaction.atomic
def update_system_settings(*, fiscal_year_label=None, registration_fee=None, enrollment_open=None, user=None):
    settings = SystemSettings.load()
    update_fields = ["updated_at"]

    if fiscal_year_label is not None:
        label = (fiscal_year_label or "").strip()
        if not label:
            raise ValueError("Fiscal year label is required.")
        settings.fiscal_year_label = label[:32]
        update_fields.append("fiscal_year_label")

    if registration_fee is not None:
        settings.registration_fee = _decimal(registration_fee, "Registration fee")
        update_fields.append("registration_fee")

    if enrollment_open is not None:
        settings.enrollment_open = bool(enrollment_open)
        update_fields.append("enrollment_open")

    if user is not None:
        settings.updated_by = user
        update_fields.append("updated_by")

    settings.save(update_fields=update_fields)
    clear_program_config_cache()
    return _serialize_settings(settings)


def auto_seed_standard_competencies(program: NcProgram):
    from .defaults import TESDA_STANDARD_BASIC_COMPETENCIES, TESDA_STANDARD_COMMON_COMPETENCIES

    to_create = []
    for idx, u in enumerate(TESDA_STANDARD_BASIC_COMPETENCIES[:4], start=1):
        to_create.append(
            ProgramCompetency(
                program=program,
                category=ProgramCompetency.Category.BASIC,
                code=u.get("code") or "",
                title=u.get("title") or "",
                nominal_hours=u.get("nominal_hours") or 10,
                sort_order=idx,
                learning_outcomes=u.get("learning_outcomes") or [],
                is_active=True,
            )
        )
    for idx, u in enumerate(TESDA_STANDARD_COMMON_COMPETENCIES[:3], start=1):
        to_create.append(
            ProgramCompetency(
                program=program,
                category=ProgramCompetency.Category.COMMON,
                code=u.get("code") or "",
                title=u.get("title") or "",
                nominal_hours=u.get("nominal_hours") or 20,
                sort_order=idx,
                learning_outcomes=u.get("learning_outcomes") or [],
                is_active=True,
            )
        )
    if to_create:
        ProgramCompetency.objects.bulk_create(to_create)


@transaction.atomic
def create_program(*, name, training_fee, sort_order=None, is_active=True, competencies=None):
    label = (name or "").strip()
    if not label:
        raise ValueError("Program name is required.")
    if NcProgram.objects.filter(name__iexact=label).exists():
        raise ValueError("A program with this name already exists.")

    fee = _decimal(training_fee if training_fee is not None else 0, "Training fee")
    order = int(sort_order) if sort_order not in (None, "") else (
        (NcProgram.objects.order_by("-sort_order").values_list("sort_order", flat=True).first() or 0) + 1
    )

    row = NcProgram.objects.create(
        name=label,
        training_fee=fee,
        sort_order=max(order, 0),
        is_active=bool(is_active),
    )

    if competencies is not None and isinstance(competencies, list):
        save_program_competencies(row.pk, competencies)
    else:
        auto_seed_standard_competencies(row)

    clear_program_config_cache()
    return _serialize_program(row, include_competencies=True)


@transaction.atomic
def update_program(program_id, *, name=None, training_fee=None, sort_order=None, is_active=None, competencies=None):
    try:
        row = NcProgram.objects.get(pk=program_id)
    except NcProgram.DoesNotExist as exc:
        raise ValueError("Program not found.") from exc

    update_fields = ["updated_at"]

    if name is not None:
        label = (name or "").strip()
        if not label:
            raise ValueError("Program name is required.")
        if NcProgram.objects.filter(name__iexact=label).exclude(pk=row.pk).exists():
            raise ValueError("A program with this name already exists.")
        row.name = label
        update_fields.append("name")

    if training_fee is not None:
        row.training_fee = _decimal(training_fee, "Training fee")
        update_fields.append("training_fee")

    if sort_order is not None:
        row.sort_order = max(int(sort_order), 0)
        update_fields.append("sort_order")

    if is_active is not None:
        row.is_active = bool(is_active)
        update_fields.append("is_active")

    row.save(update_fields=update_fields)

    if competencies is not None and isinstance(competencies, list):
        save_program_competencies(row.pk, competencies)

    clear_program_config_cache()
    return _serialize_program(row, include_competencies=True)


def list_program_competencies(program_id: int) -> list[dict]:
    try:
        program = NcProgram.objects.get(pk=program_id)
    except NcProgram.DoesNotExist as exc:
        raise ValueError("Program not found.") from exc

    comps = program.competencies.all().order_by("category", "sort_order", "id")
    return [_serialize_competency(c) for c in comps]


@transaction.atomic
def save_program_competencies(program_id: int, competencies_data: list[dict]) -> list[dict]:
    try:
        program = NcProgram.objects.get(pk=program_id)
    except NcProgram.DoesNotExist as exc:
        raise ValueError("Program not found.") from exc

    program.competencies.all().delete()
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
                program=program,
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

    clear_program_config_cache()
    comps = program.competencies.all().order_by("category", "sort_order", "id")
    return [_serialize_competency(c) for c in comps]


def get_competency_library() -> dict:
    from .defaults import (
        TESDA_STANDARD_BASIC_COMPETENCIES,
        TESDA_STANDARD_COMMON_COMPETENCIES,
        TESDA_STANDARD_CORE_COMPETENCIES,
    )

    return {
        "basic": TESDA_STANDARD_BASIC_COMPETENCIES,
        "common": TESDA_STANDARD_COMMON_COMPETENCIES,
        "core": TESDA_STANDARD_CORE_COMPETENCIES,
    }
