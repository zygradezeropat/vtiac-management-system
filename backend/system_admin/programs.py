"""Admin CRUD for NC programs and portal system settings."""

from decimal import Decimal, InvalidOperation

from django.db import transaction

from .models import NcProgram, SystemSettings, seed_default_programs
from .program_config import clear_program_config_cache


def _decimal(value, field_label: str) -> Decimal:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError):
        raise ValueError(f"{field_label} must be a valid amount.") from None
    if amount < 0:
        raise ValueError(f"{field_label} cannot be negative.")
    return amount


def _serialize_program(row: NcProgram) -> dict:
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
        "trainingFee": float(row.training_fee),
        "sortOrder": row.sort_order,
        "isActive": row.is_active,
        "ncLevel": nc_level,
    }


def _serialize_settings(settings: SystemSettings) -> dict:
    return {
        "fiscalYearLabel": settings.fiscal_year_label,
        "registrationFee": float(settings.registration_fee),
        "enrollmentOpen": settings.enrollment_open,
    }


def system_settings_payload() -> dict:
    seed_default_programs()
    settings = SystemSettings.load()
    programs = [_serialize_program(row) for row in NcProgram.objects.order_by("sort_order", "name")]
    return {
        "settings": _serialize_settings(settings),
        "programs": programs,
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


def create_program(*, name, training_fee, sort_order=None, is_active=True):
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
    clear_program_config_cache()
    return _serialize_program(row)


def update_program(program_id, *, name=None, training_fee=None, sort_order=None, is_active=None):
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
    clear_program_config_cache()
    return _serialize_program(row)
