"""Read portal master data (programs, fees, fiscal year) from the database."""

from decimal import Decimal

from .defaults import (
    DEFAULT_FISCAL_YEAR_LABEL,
    DEFAULT_PROGRAMS,
    DEFAULT_REGISTRATION_FEE,
    PROGRAM_ALIASES,
    REGISTRATION_FEE_LABEL,
)


def _normalize_key(program: str) -> str:
    return " ".join((program or "").lower().split())


def clear_program_config_cache():
    """No-op placeholder for future caching; called after admin writes."""
    return None


def _active_program_rows():
    from .models import NcProgram, seed_default_programs

    seed_default_programs()
    return list(NcProgram.objects.filter(is_active=True).order_by("sort_order", "name"))


def _all_program_rows():
    from .models import NcProgram, seed_default_programs

    seed_default_programs()
    return list(NcProgram.objects.order_by("sort_order", "name"))


def _default_options_tuple() -> tuple[str, ...]:
    return tuple(name for name, _fee, _order in DEFAULT_PROGRAMS)


def _default_fees_dict() -> dict[str, Decimal]:
    return {name: fee for name, fee, _order in DEFAULT_PROGRAMS}


def enrollment_program_options(*, include_inactive: bool = False) -> tuple[str, ...]:
    rows = _all_program_rows() if include_inactive else _active_program_rows()
    if rows:
        if include_inactive:
            return tuple(row.name for row in rows)
        return tuple(row.name for row in rows if row.is_active)
    return _default_options_tuple()


def program_fees_dict(*, include_inactive: bool = False) -> dict[str, Decimal]:
    rows = _all_program_rows() if include_inactive else _active_program_rows()
    if rows:
        if include_inactive:
            return {row.name: row.training_fee for row in rows}
        return {row.name: row.training_fee for row in rows if row.is_active}
    return _default_fees_dict()


def registration_fee_amount() -> Decimal:
    from .models import SystemSettings

    settings = SystemSettings.load()
    return settings.registration_fee or DEFAULT_REGISTRATION_FEE


def fiscal_year_label() -> str:
    from .models import SystemSettings

    settings = SystemSettings.load()
    label = (settings.fiscal_year_label or "").strip()
    return label or DEFAULT_FISCAL_YEAR_LABEL


def enrollment_is_open() -> bool:
    from .models import SystemSettings

    return SystemSettings.load().enrollment_open


def resolve_program(program: str) -> str | None:
    """Map stored program text to a canonical program name."""
    raw = (program or "").strip()
    if not raw:
        return None

    all_fees = program_fees_dict(include_inactive=True)
    if raw in all_fees:
        return raw

    norm = _normalize_key(raw)
    if norm in PROGRAM_ALIASES:
        canonical = PROGRAM_ALIASES[norm]
        if canonical in all_fees:
            return canonical

    options = enrollment_program_options(include_inactive=True)
    for option in options:
        if _normalize_key(option) == norm:
            return option
    for option in options:
        opt_norm = _normalize_key(option)
        if norm in opt_norm or opt_norm in norm:
            return option
    return None


def program_fee_amount(program: str) -> Decimal | None:
    canonical = resolve_program(program)
    if not canonical:
        return None
    return program_fees_dict(include_inactive=True).get(canonical)


def fee_lines_for_program(program: str) -> list[dict]:
    """Default cashier particulars: registration fee + program training fee."""
    reg_fee = registration_fee_amount()
    lines = [
        {
            "description": REGISTRATION_FEE_LABEL,
            "amount": float(reg_fee),
        }
    ]
    canonical = resolve_program(program)
    if canonical:
        amount = program_fees_dict(include_inactive=True).get(canonical)
        if amount is not None:
            lines.append(
                {
                    "description": canonical,
                    "amount": float(amount),
                }
            )
    elif (program or "").strip():
        lines.append(
            {
                "description": (program or "").strip(),
                "amount": 0.0,
            }
        )
    return lines


def payment_list_display() -> list[dict]:
    reg_fee = registration_fee_amount()
    rows = [
        {
            "description": REGISTRATION_FEE_LABEL,
            "amount": float(reg_fee),
            "amountDisplay": f"₱{reg_fee:,.2f}",
        }
    ]
    for name in enrollment_program_options():
        fee = program_fees_dict().get(name, Decimal("0"))
        rows.append(
            {
                "description": name,
                "amount": float(fee),
                "amountDisplay": f"₱{fee:,.2f}",
            }
        )
    return rows
