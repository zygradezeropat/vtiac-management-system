"""Admin CRUD and public options for Training Schedules."""

from django.utils.text import slugify

from .models import TrainingSchedule, seed_default_schedules


def _serialize_schedule(row: TrainingSchedule) -> dict:
    code = row.code or slugify(row.name).replace("-", "_")
    return {
        "id": row.pk,
        "name": row.name,
        "code": code,
        "days": row.days or "",
        "timeSlot": row.time_slot or "",
        "sortOrder": row.sort_order,
        "isActive": row.is_active,
    }


def list_schedules() -> list[dict]:
    seed_default_schedules()
    return [
        _serialize_schedule(row)
        for row in TrainingSchedule.objects.order_by("sort_order", "name")
    ]


def create_schedule(
    *,
    name: str,
    days: str = "",
    time_slot: str = "",
    code: str = "",
    sort_order: int | None = None,
    is_active: bool = True,
) -> dict:
    label = (name or "").strip()
    if not label:
        raise ValueError("Schedule name is required.")
    if TrainingSchedule.objects.filter(name__iexact=label).exists():
        raise ValueError("A schedule with this name already exists.")

    sched_code = (code or "").strip().lower().replace("-", "_")
    if not sched_code:
        sched_code = slugify(label).replace("-", "_")[:80]

    order = (
        int(sort_order)
        if sort_order not in (None, "")
        else (
            (
                TrainingSchedule.objects.order_by("-sort_order")
                .values_list("sort_order", flat=True)
                .first()
                or 0
            )
            + 1
        )
    )

    row = TrainingSchedule.objects.create(
        name=label,
        code=sched_code,
        days=(days or "").strip(),
        time_slot=(time_slot or "").strip(),
        sort_order=max(order, 0),
        is_active=bool(is_active),
    )
    return _serialize_schedule(row)


def update_schedule(
    schedule_id: int,
    *,
    name: str | None = None,
    days: str | None = None,
    time_slot: str | None = None,
    code: str | None = None,
    sort_order: int | None = None,
    is_active: bool | None = None,
) -> dict:
    try:
        row = TrainingSchedule.objects.get(pk=schedule_id)
    except TrainingSchedule.DoesNotExist as exc:
        raise ValueError("Schedule not found.") from exc

    update_fields = ["updated_at"]

    if name is not None:
        label = (name or "").strip()
        if not label:
            raise ValueError("Schedule name is required.")
        if (
            TrainingSchedule.objects.filter(name__iexact=label)
            .exclude(pk=row.pk)
            .exists()
        ):
            raise ValueError("A schedule with this name already exists.")
        row.name = label
        update_fields.append("name")

    if days is not None:
        row.days = (days or "").strip()
        update_fields.append("days")

    if time_slot is not None:
        row.time_slot = (time_slot or "").strip()
        update_fields.append("time_slot")

    if code is not None:
        sched_code = (code or "").strip().lower().replace("-", "_")
        row.code = sched_code or slugify(row.name).replace("-", "_")[:80]
        update_fields.append("code")

    if sort_order is not None:
        row.sort_order = max(int(sort_order), 0)
        update_fields.append("sort_order")

    if is_active is not None:
        row.is_active = bool(is_active)
        update_fields.append("is_active")

    row.save(update_fields=update_fields)
    return _serialize_schedule(row)


def delete_schedule(schedule_id: int):
    try:
        row = TrainingSchedule.objects.get(pk=schedule_id)
    except TrainingSchedule.DoesNotExist as exc:
        raise ValueError("Schedule not found.") from exc
    row.delete()
    return True


def enrollment_schedule_options() -> list[dict]:
    """Active schedule options formatted for the public student registration wizard."""
    seed_default_schedules()
    qs = TrainingSchedule.objects.filter(is_active=True).order_by("sort_order", "name")
    return [
        {
            "id": row.code or slugify(row.name).replace("-", "_") or str(row.pk),
            "label": row.name,
            "days": row.days,
            "time": row.time_slot,
        }
        for row in qs
    ]


def enrollment_schedule_codes() -> set[str]:
    """Set of valid schedule identifiers (codes and names) accepted upon registration."""
    seed_default_schedules()
    qs = TrainingSchedule.objects.filter(is_active=True)
    codes = set()
    for row in qs:
        if row.code:
            codes.add(row.code)
        codes.add(slugify(row.name).replace("-", "_"))
        codes.add(row.name)
        codes.add(str(row.pk))
    return codes
