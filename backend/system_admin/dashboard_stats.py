"""Admin dashboard aggregates — NC program cards, EGACE summary, pending counts."""

from collections import defaultdict

from backend.cashier.balance import fee_balance_for_profile
from backend.cashier.fees import resolve_program
from backend.registrar.models import RegistrarScheduleTemplate
from backend.registrar.pending_enrollment import (
    _profile_for_registration,
    _program_for_profile,
    pending_enrollment_count,
)
from backend.student.document_review import (
    all_reviewable_documents_approved,
    reviewable_document_keys,
)
from backend.student.models import StudentEnrollmentProfile, StudentRegistration
from backend.system_admin.program_config import enrollment_program_options
from backend.trainer.egace_records import egace_rows_for_registrar


def _nc_level(program_name: str) -> str:
    name = program_name or ""
    if " NC III" in name:
        return "nc3"
    if " NC II" in name:
        return "nc2"
    if " NC I" in name:
        return "nc1"
    return "other"


def _empty_metrics() -> dict:
    return {
        "enrolled": 0,
        "graduated": 0,
        "assessed": 0,
        "certified": 0,
        "employed": 0,
    }


def _enrolled_by_program() -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    approved_regs = StudentRegistration.objects.filter(
        status=StudentRegistration.Status.APPROVED,
    ).select_related("user")

    for reg in approved_regs:
        profile = _profile_for_registration(reg)
        program = resolve_program(_program_for_profile(profile, reg) or reg.selected_program or "")
        if program:
            counts[program] += 1
    return counts


def _egace_metrics_by_course() -> dict[str, dict]:
    """Aggregate trainer EGACE records by canonical course name."""
    by_course: dict[str, dict] = defaultdict(_empty_metrics)

    for record in egace_rows_for_registrar():
        course = resolve_program(record.get("course") or "") or (record.get("course") or "Unspecified")
        metrics = by_course[course]
        if record.get("enrolled"):
            metrics["enrolled"] += 1
        if record.get("graduate"):
            metrics["graduated"] += 1
        if record.get("assessment"):
            metrics["assessed"] += 1
        if record.get("certificate"):
            metrics["certified"] += 1
        if record.get("employment"):
            metrics["employed"] += 1

    return by_course


def _program_cards_payload() -> list[dict]:
    enrolled_counts = _enrolled_by_program()
    egace_by_course = _egace_metrics_by_course()
    cards = []

    for program in enrollment_program_options():
        egace = egace_by_course.get(program, _empty_metrics())
        cards.append(
            {
                "name": program,
                "ncLevel": _nc_level(program),
                "enrolled": enrolled_counts.get(program, 0),
                "graduated": egace["graduated"],
                "assessed": egace["assessed"],
                "certified": egace["certified"],
                "employed": egace["employed"],
            }
        )
    return cards


def _egace_summary_payload() -> list[dict]:
    by_course = _egace_metrics_by_course()
    rows = []

    for program in enrollment_program_options():
        metrics = by_course.get(program, _empty_metrics())
        if metrics["enrolled"] == 0 and program not in by_course:
            continue
        rows.append({"course": program, **metrics})

    extra_courses = sorted(set(by_course.keys()) - set(enrollment_program_options()))
    for course in extra_courses:
        rows.append({"course": course, **by_course[course]})

    return rows


def _pct_of_enrolled(count: int, enrolled: int) -> int:
    if enrolled <= 0:
        return 0
    return round(count * 100 / enrolled)


def _metrics_with_percentages(metrics: dict) -> dict:
    enrolled = metrics["enrolled"]
    return {
        "enrolled": {"actual": enrolled, "percent": 100 if enrolled else 0},
        "graduated": {
            "actual": metrics["graduated"],
            "percent": _pct_of_enrolled(metrics["graduated"], enrolled),
        },
        "assessed": {
            "actual": metrics["assessed"],
            "percent": _pct_of_enrolled(metrics["assessed"], enrolled),
        },
        "certified": {
            "actual": metrics["certified"],
            "percent": _pct_of_enrolled(metrics["certified"], enrolled),
        },
        "employed": {
            "actual": metrics["employed"],
            "percent": _pct_of_enrolled(metrics["employed"], enrolled),
        },
    }


def _batch_display_label(batch_key: str, index: int) -> str:
    text = (batch_key or "").strip()
    if not text or text.lower() == "unassigned":
        return f"BATCH {index + 1}"
    upper = text.upper()
    if upper.startswith("BATCH"):
        return upper
    return f"BATCH {text}" if text.isdigit() else upper


def _egace_batch_report_payload() -> dict:
    """Per-qualification batch rows with Actual / % columns (admin EGACE summary)."""
    rows = egace_rows_for_registrar()
    by_course_batches: dict[str, dict[str, dict]] = defaultdict(
        lambda: defaultdict(_empty_metrics)
    )

    for record in rows:
        course = resolve_program(record.get("course") or "") or (
            record.get("course") or ""
        )
        if not course or course == "—":
            continue
        batch_key = (record.get("batchLabel") or "Unassigned").strip() or "Unassigned"
        metrics = by_course_batches[course][batch_key]
        if record.get("enrolled"):
            metrics["enrolled"] += 1
        if record.get("graduate"):
            metrics["graduated"] += 1
        if record.get("assessment"):
            metrics["assessed"] += 1
        if record.get("certificate"):
            metrics["certified"] += 1
        if record.get("employment"):
            metrics["employed"] += 1

    courses = sorted(by_course_batches.keys(), key=str.lower)
    reports: dict[str, dict] = {}

    for course in courses:
        batches_raw = by_course_batches[course]
        batch_rows = []
        total = _empty_metrics()

        for index, (batch_key, metrics) in enumerate(
            sorted(batches_raw.items(), key=lambda item: item[0].lower())
        ):
            for key in total:
                total[key] += metrics[key]
            batch_rows.append(
                {
                    "label": _batch_display_label(batch_key, index),
                    "isTotal": False,
                    **_metrics_with_percentages(metrics),
                }
            )

        reports[course] = {
            "qualification": course,
            "batches": batch_rows,
            "total": {
                "label": "TOTAL",
                "isTotal": True,
                **_metrics_with_percentages(total),
            },
        }

    default_course = ""
    for course in courses:
        if reports[course]["total"]["enrolled"]["actual"] > 0:
            default_course = course
            break
    if not default_course and courses:
        default_course = courses[0]

    return {
        "courses": courses,
        "defaultCourse": default_course,
        "reports": reports,
    }


def outstanding_balance_count() -> int:
    count = 0
    approved_regs = StudentRegistration.objects.filter(
        status=StudentRegistration.Status.APPROVED,
    ).select_related("user")

    for reg in approved_regs:
        profile = _profile_for_registration(reg)
        program = _program_for_profile(profile, reg)
        balance = fee_balance_for_profile(profile, program)
        if balance["hasBalanceDue"] and balance["totalAssessed"] > 0:
            count += 1
    return count


def pending_document_review_count() -> int:
    count = 0
    profiles = StudentEnrollmentProfile.objects.filter(
        requirements_submitted=True,
        documents_review_released=False,
    ).prefetch_related("documents")

    for profile in profiles:
        if not reviewable_document_keys(profile):
            continue
        if not all_reviewable_documents_approved(profile):
            count += 1
    return count


def unfinalized_batch_count() -> int:
    return RegistrarScheduleTemplate.objects.filter(
        status=RegistrarScheduleTemplate.Status.DRAFT,
    ).count()


def pending_counts_payload() -> list[dict]:
    items = [
        {
            "key": "enrollments",
            "label": "Enrollment approvals",
            "count": pending_enrollment_count(),
            "icon": "bi-person-plus-fill",
        },
        {
            "key": "balances",
            "label": "Outstanding balances",
            "count": outstanding_balance_count(),
            "icon": "bi-cash-stack",
        },
        {
            "key": "documents",
            "label": "Document reviews",
            "count": pending_document_review_count(),
            "icon": "bi-file-earmark-text-fill",
        },
        {
            "key": "batches",
            "label": "Unfinalized batches",
            "count": unfinalized_batch_count(),
            "icon": "bi-calendar-week-fill",
        },
    ]
    return items


def admin_dashboard_stats() -> dict:
    return {
        "pendingCounts": pending_counts_payload(),
        "programs": _program_cards_payload(),
        "egaceSummary": _egace_summary_payload(),
        "egaceBatchReport": _egace_batch_report_payload(),
    }
