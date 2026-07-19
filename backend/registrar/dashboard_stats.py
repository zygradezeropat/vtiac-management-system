"""Registrar dashboard chart data from enrollment records."""

from collections import defaultdict
from datetime import date

from django.utils import timezone
from django.utils.dateparse import parse_date

from backend.student.models import StudentEnrollmentProfile, StudentRegistration

MONTH_LABELS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

PIE_COLORS = ("#00a859", "#2d5bff", "#8b5cf6", "#f59e0b", "#ec4899", "#14b8a6", "#6366f1", "#eab308")


def _coerce_date(value) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    return parse_date(str(value).strip()[:10])


def _coerce_year(value) -> int | None:
    if value is None or value == "":
        return None
    try:
        year = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    if 2000 <= year <= 2100:
        return year
    return None


def _series_from_month_counts(counts_by_month: dict[int, int]) -> list[int]:
    return [counts_by_month.get(m, 0) for m in range(1, 13)]


def _program_label(profile: StudentEnrollmentProfile | None, reg: StudentRegistration) -> str:
    if profile and profile.selected_program:
        return profile.selected_program
    return reg.selected_program or "Unspecified"


def _enrollment_profile(reg: StudentRegistration) -> StudentEnrollmentProfile | None:
    if hasattr(reg, "tesda_profile"):
        try:
            return reg.tesda_profile
        except StudentEnrollmentProfile.DoesNotExist:
            pass
    if reg.user_id:
        return getattr(reg.user, "enrollment_profile", None)
    return None


def _enrollment_local_dt(reg: StudentRegistration, profile: StudentEnrollmentProfile | None):
    if profile and profile.updated_at:
        return timezone.localtime(profile.updated_at)
    if reg.created_at:
        return timezone.localtime(reg.created_at)
    return None


def _in_date_range(dt, start_date: date | None, end_date: date | None) -> bool:
    day = dt.date()
    if start_date and day < start_date:
        return False
    if end_date and day > end_date:
        return False
    return True


def registrar_dashboard_stats(
    year: int | None = None,
    start_date=None,
    end_date=None,
) -> dict:
    """Aggregates for monthly bar (year) and program pie (optional date range)."""
    now = timezone.localtime()
    start_date = _coerce_date(start_date)
    end_date = _coerce_date(end_date)
    year = _coerce_year(year) or now.year

    current_month_index = now.month - 1 if now.year == year else 0
    has_pie_range = bool(start_date or end_date)

    approved_regs = StudentRegistration.objects.filter(
        status=StudentRegistration.Status.APPROVED,
    ).select_related("user")

    enrolled_by_month: dict[int, int] = defaultdict(int)
    program_counts: dict[str, int] = defaultdict(int)
    years_seen: set[int] = set()

    for reg in approved_regs:
        profile = _enrollment_profile(reg)
        dt = _enrollment_local_dt(reg, profile)
        if dt:
            years_seen.add(dt.year)

        # Monthly chart: year filter only
        if dt and dt.year == year:
            enrolled_by_month[dt.month] += 1

        # Pie chart: optional From/To range; otherwise all approved
        if has_pie_range:
            if not dt or not _in_date_range(dt, start_date, end_date):
                continue
        program_counts[_program_label(profile, reg)] += 1

    enrolled_series = _series_from_month_counts(enrolled_by_month)
    monthly_enrollment = [
        {"month": MONTH_LABELS[i], "value": enrolled_series[i]} for i in range(12)
    ]

    pie_programs = []
    for idx, (label, value) in enumerate(
        sorted(program_counts.items(), key=lambda x: (-x[1], x[0]))
    ):
        pie_programs.append(
            {
                "label": label,
                "color": PIE_COLORS[idx % len(PIE_COLORS)],
                "value": value,
            }
        )

    available_years = sorted(years_seen | {year, now.year}, reverse=True)
    # Keep a small window so the dropdown is usable even with sparse data
    for y in range(now.year, now.year - 5, -1):
        if y not in available_years:
            available_years.append(y)
    available_years = sorted(set(available_years), reverse=True)

    return {
        "year": year,
        "availableYears": available_years,
        "currentMonthIndex": current_month_index,
        "monthlyEnrollment": monthly_enrollment,
        "piePrograms": pie_programs,
        "filterStart": start_date.isoformat() if start_date else "",
        "filterEnd": end_date.isoformat() if end_date else "",
    }
