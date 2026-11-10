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


import datetime


def _serialize_settings(settings: SystemSettings) -> dict:
    status_info = settings.get_evaluation_status()
    return {
        "fiscalYearLabel": settings.fiscal_year_label,
        "registrationFee": float(settings.registration_fee),
        "enrollmentOpen": settings.enrollment_open,
        "evaluationEnabled": settings.evaluation_enabled,
        "evaluationStartDate": settings.evaluation_start_date.isoformat() if settings.evaluation_start_date else "",
        "evaluationEndDate": settings.evaluation_end_date.isoformat() if settings.evaluation_end_date else "",
        "evaluationInstructions": settings.evaluation_instructions or "",
        "evaluationIsOpen": status_info["is_open"],
        "evaluationStatus": status_info["status"],
        "evaluationBadgeClass": status_info.get("badge_class", "bg-secondary"),
        "evaluationBadgeText": status_info.get("badge_text", "Disabled"),
        "evaluationMessage": status_info["message"],
        "evaluationFormattedPeriod": status_info.get("formatted_period", ""),
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
def update_system_settings(
    *,
    fiscal_year_label=None,
    registration_fee=None,
    enrollment_open=None,
    evaluation_enabled=None,
    evaluation_start_date=None,
    evaluation_end_date=None,
    evaluation_instructions=None,
    user=None,
):
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

    if evaluation_start_date is not None:
        if evaluation_start_date == "" or evaluation_start_date is False:
            settings.evaluation_start_date = None
        elif isinstance(evaluation_start_date, str):
            clean_date = evaluation_start_date.strip()
            settings.evaluation_start_date = datetime.date.fromisoformat(clean_date) if clean_date else None
        elif isinstance(evaluation_start_date, datetime.date):
            settings.evaluation_start_date = evaluation_start_date
        update_fields.append("evaluation_start_date")

    if evaluation_end_date is not None:
        if evaluation_end_date == "" or evaluation_end_date is False:
            settings.evaluation_end_date = None
        elif isinstance(evaluation_end_date, str):
            clean_date = evaluation_end_date.strip()
            settings.evaluation_end_date = datetime.date.fromisoformat(clean_date) if clean_date else None
        elif isinstance(evaluation_end_date, datetime.date):
            settings.evaluation_end_date = evaluation_end_date
        update_fields.append("evaluation_end_date")

    if settings.evaluation_start_date and settings.evaluation_end_date:
        if settings.evaluation_start_date > settings.evaluation_end_date:
            raise ValueError("Evaluation start date cannot be after end date.")
        settings.evaluation_enabled = True
    else:
        settings.evaluation_enabled = False
    update_fields.append("evaluation_enabled")

    if evaluation_instructions is not None:
        settings.evaluation_instructions = (evaluation_instructions or "").strip()
        update_fields.append("evaluation_instructions")

    if user is not None:
        settings.updated_by = user
        update_fields.append("updated_by")

    settings.save(update_fields=update_fields)
    clear_program_config_cache()

    if settings.evaluation_enabled and settings.evaluation_start_date and settings.evaluation_end_date:
        try:
            notify_enrolled_students_of_evaluation_schedule(settings)
        except Exception:
            pass

    return _serialize_settings(settings)


def notify_enrolled_students_of_evaluation_schedule(settings: SystemSettings):
    """
    Send an in-app portal notification to all enrolled students that trainer evaluation is scheduled / open.
    """
    if not settings.evaluation_enabled or not settings.evaluation_start_date or not settings.evaluation_end_date:
        return

    from django.contrib.auth import get_user_model
    from backend.student.models import StudentRegistration
    from backend.core.models import PortalNotification
    from backend.core.notification_service import create_notification
    from django.utils import timezone

    User = get_user_model()
    today = timezone.localdate()
    start_str = settings.evaluation_start_date.strftime("%B %d, %Y")
    end_str = settings.evaluation_end_date.strftime("%B %d, %Y")

    if today >= settings.evaluation_start_date and today <= settings.evaluation_end_date:
        title = "Action Required: Trainer Evaluation Open"
        msg = f"The Trainer Evaluation period is now open until {end_str}. Please submit an evaluation for your assigned trainer."
    else:
        title = "Trainer Evaluation Schedule Announced"
        msg = f"Trainer Evaluation is scheduled for {start_str} to {end_str}. Please prepare to evaluate your trainer during this period."

    if settings.evaluation_instructions:
        msg += f" Note: {settings.evaluation_instructions}"

    link = "/dashboard/student/trainer-evaluation/"

    enrolled_students = User.objects.filter(
        registration_application__status=StudentRegistration.Status.APPROVED
    ).distinct()

    for student in enrolled_students:
        exists = PortalNotification.objects.filter(
            user=student,
            title=title,
            link_url=link,
        ).exists()
        if not exists:
            create_notification(
                student,
                category=PortalNotification.Category.GENERAL,
                title=title,
                message=msg,
                link_url=link,
            )


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
