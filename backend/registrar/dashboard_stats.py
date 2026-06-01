"""Registrar dashboard chart data from enrollment records."""

from collections import defaultdict

from django.utils import timezone

from backend.student.models import StudentEnrollmentProfile, StudentRegistration

MONTH_LABELS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

PIE_COLORS = ("#00a859", "#2d5bff", "#8b5cf6", "#f59e0b", "#ec4899", "#14b8a6", "#6366f1", "#eab308")


def _series_from_month_counts(counts_by_month: dict[int, int]) -> list[int]:
    return [counts_by_month.get(m, 0) for m in range(1, 13)]


def _program_label(profile: StudentEnrollmentProfile | None, reg: StudentRegistration) -> str:
    if profile and profile.selected_program:
        return profile.selected_program
    return reg.selected_program or "Unspecified"


def registrar_dashboard_stats(year: int | None = None) -> dict:
    """Aggregates for monthly bar and program pie charts."""
    now = timezone.localtime()
    year = year or now.year
    current_month_index = now.month - 1 if now.year == year else 0

    approved_regs = StudentRegistration.objects.filter(
        status=StudentRegistration.Status.APPROVED,
    ).select_related("user")

    enrolled_by_month: dict[int, int] = defaultdict(int)
    for reg in approved_regs:
        profile = None
        if hasattr(reg, "tesda_profile"):
            try:
                profile = reg.tesda_profile
            except StudentEnrollmentProfile.DoesNotExist:
                pass
        if not profile and reg.user_id:
            profile = getattr(reg.user, "enrollment_profile", None)

        dt = None
        if profile and profile.updated_at:
            dt = timezone.localtime(profile.updated_at)
        elif reg.created_at:
            dt = timezone.localtime(reg.created_at)
        if not dt or dt.year != year:
            continue
        enrolled_by_month[dt.month] += 1

    enrolled_series = _series_from_month_counts(enrolled_by_month)

    monthly_enrollment = [
        {"month": MONTH_LABELS[i], "value": enrolled_series[i]} for i in range(12)
    ]

    program_counts: dict[str, int] = defaultdict(int)
    for reg in approved_regs:
        profile = None
        if reg.user_id:
            profile = getattr(reg.user, "enrollment_profile", None)
        if not profile:
            try:
                profile = reg.tesda_profile
            except StudentEnrollmentProfile.DoesNotExist:
                profile = None
        label = _program_label(profile, reg)
        program_counts[label] += 1

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

    return {
        "year": year,
        "currentMonthIndex": current_month_index,
        "monthlyEnrollment": monthly_enrollment,
        "piePrograms": pie_programs,
    }
