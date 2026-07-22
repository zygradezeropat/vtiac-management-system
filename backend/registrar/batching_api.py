"""Registrar batching & scheduling API (DB-backed course cards and templates)."""

from datetime import date, datetime
from decimal import Decimal

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.text import slugify
from django.views.decorators.http import require_http_methods

from backend.accounts.services import require_portal_access
from backend.student.models import StudentRegistration
from backend.trainer.models import TrainerAccountRequest
from backend.trainer.egace_progress import (
    grade_payload_for_registration,
    student_is_graduate,
)

from .batching_student_pool import available_students_for_course
from .models import RegistrarScheduleTemplate
from .services import REGISTRAR_ROLE


BatchKind = RegistrarScheduleTemplate.BatchKind

MIN_STUDENTS_TO_ACTIVATE = 3


DAY_DISPLAY = {
    "mon": "Monday",
    "tue": "Tuesday",
    "wed": "Wednesday",
    "thu": "Thursday",
    "fri": "Friday",
    "sat": "Saturday",
    "sun": "Sunday",
}


COURSE_DURATIONS = {
    "Driving NC II": 19,
    "Driving NC III (Passenger Bus / Straight Truck)": 24,
    "Automotive Servicing NC I": 61,
    "Automotive Servicing NC II": 37,
    "Automotive Servicing (Engine Repair) NC II": 37,
    "Rice Machinery Operations NC II": 29,
    "Assessment": 1,
    "Competency Assessment": 1,
}


DEFAULT_BATCHING_COURSES = (
    "Driving NC II",
    "Driving NC III (Passenger Bus / Straight Truck)",
    "Automotive Servicing NC I",
    "Automotive Servicing (Engine Repair) NC II",
    "Rice Machinery Operations NC II",
    "Assessment",
)


BATCHING_CATEGORY_INSTITUTIONAL = "institutional"
BATCHING_CATEGORY_NATIONAL = "national"


def _course_catalog():
    """Only courses that currently exist in DB data."""

    from .pending_enrollment import pending_programs_by_type

    from_templates = list(
        RegistrarScheduleTemplate.objects.exclude(
            course_name=""
        )
        .values_list(
            "course_name",
            flat=True,
        )
        .distinct()
    )

    from_registrations = list(
        StudentRegistration.objects.exclude(
            selected_program=""
        )
        .filter(
            status=StudentRegistration.Status.APPROVED
        )
        .values_list(
            "selected_program",
            flat=True,
        )
        .distinct()
    )

    seen = set()
    out = []

    for name in [
        *DEFAULT_BATCHING_COURSES,
        *from_registrations,
        *from_templates,
    ]:
        key = name.strip()

        if not key or key in seen:
            continue

        seen.add(key)
        out.append(key)

    return sorted(out)


def _course_id(
    name: str,
    *,
    batch_kind: str = BatchKind.TRAINING,
) -> str:
    base = slugify(name)[:80] or "course"

    if batch_kind == BatchKind.NATIONAL_ASSESSMENT:
        suffix = "-national-assessment"

        return (
            f"{base[: max(1, 80 - len(suffix))]}"
            f"{suffix}"
        )

    return base


def batching_courses_payload():
    from .pending_enrollment import pending_programs_by_type

    pending_training, pending_assessment = (
        pending_programs_by_type()
    )

    courses = []

    for name in _course_catalog():

        # ---------------------------------------------------------
        # TRAINING / INSTITUTIONAL
        # ---------------------------------------------------------

        training_students = available_students_for_course(
            name,
            batch_kind=BatchKind.TRAINING,
        )

        if (
            training_students
            or name in pending_training
        ):
            courses.append(
                {
                    "id": _course_id(
                        name,
                        batch_kind=BatchKind.TRAINING,
                    ),
                    "name": name,
                    "category": BATCHING_CATEGORY_INSTITUTIONAL,
                    "batchKind": BatchKind.TRAINING.value,
                    "durationDays": COURSE_DURATIONS.get(
                        name,
                        0,
                    ),
                    "batches": [
                        {
                            "id": "b1",
                            "label": "Batch 1",
                            "studentCount": len(
                                training_students
                            ),
                            "students": training_students,
                        }
                    ],
                }
            )

        # ---------------------------------------------------------
        # NATIONAL ASSESSMENT
        # ---------------------------------------------------------

        national_students = available_students_for_course(
            name,
            batch_kind=BatchKind.NATIONAL_ASSESSMENT,
        )

        if (
            national_students
            or name in pending_assessment
        ):
            courses.append(
                {
                    "id": _course_id(
                        name,
                        batch_kind=BatchKind.NATIONAL_ASSESSMENT,
                    ),
                    "name": name,
                    "category": BATCHING_CATEGORY_NATIONAL,
                    "batchKind": BatchKind.NATIONAL_ASSESSMENT.value,
                    "durationDays": COURSE_DURATIONS.get(
                        name,
                        1,
                    ),
                    "batches": [
                        {
                            "id": "b1",
                            "label": "Batch 1",
                            "studentCount": len(
                                national_students
                            ),
                            "students": national_students,
                        }
                    ],
                }
            )

    return courses


def _parse_optional_date(raw) -> date | None:
    if not raw:
        return None

    if isinstance(raw, date):
        return raw

    value = str(raw).strip()

    if not value:
        return None

    return parse_date(value)


def _format_optional_date(value) -> str:
    if not value:
        return ""

    if isinstance(value, date):
        return value.isoformat()

    parsed = parse_date(
        str(value).strip()
    )

    return (
        parsed.isoformat()
        if parsed
        else str(value).strip()
    )


def _parse_template_db_id(
    raw: str,
) -> int | None:
    """
    Return integer pk only.

    Ignore client-only IDs such as:
    tpl-1234567890
    """

    value = (raw or "").strip()

    if (
        not value
        or value.startswith("tpl-")
    ):
        return None

    try:
        return int(value)

    except (
        TypeError,
        ValueError,
    ):
        return None


def _schedule_display(
    days: list,
    schedule_type: str,
) -> str:

    if schedule_type == "weekdays":
        return "Monday – Friday"

    if schedule_type == "weekends":
        return "Saturday – Sunday"

    if not days:
        return "—"

    labels = [
        DAY_DISPLAY.get(
            d,
            d,
        )
        for d in days
        if isinstance(d, str)
    ]

    if len(labels) <= 1:
        return (
            labels[0]
            if labels
            else "—"
        )

    if len(labels) == 2:
        return (
            f"{labels[0]} – {labels[1]}"
        )

    return ", ".join(labels)


def _effective_days(
    days: list,
    schedule_type: str,
) -> set[str]:

    stype = (
        schedule_type
        or ""
    ).strip().lower()

    if stype == "weekdays":
        return {
            "mon",
            "tue",
            "wed",
            "thu",
            "fri",
        }

    if stype == "weekends":
        return {
            "sat",
            "sun",
        }

    return {
        str(day).strip().lower()
        for day in (days or [])
        if str(day).strip()
    }


def _parse_time(value: str):
    raw = (
        value
        or ""
    ).strip()

    if not raw:
        return None

    for fmt in (
        "%H:%M",
        "%I:%M %p",
        "%I:%M%p",
    ):
        try:
            return datetime.strptime(
                raw,
                fmt,
            ).time()

        except ValueError:
            continue

    return None


def _date_overlap(
    start_a: date | None,
    end_a: date | None,
    start_b: date | None,
    end_b: date | None,
) -> bool:

    if (
        not start_a
        or not end_a
        or not start_b
        or not end_b
    ):
        return True

    return (
        start_a <= end_b
        and start_b <= end_a
    )


def _schedule_conflicts(
    template: RegistrarScheduleTemplate,
    other: RegistrarScheduleTemplate,
) -> bool:

    # Check date overlap
    if not _date_overlap(
        template.available_from,
        template.available_until,
        other.available_from,
        other.available_until,
    ):
        return False

    # Check day overlap
    if not (
        _effective_days(
            template.days,
            template.schedule_type,
        )
        &
        _effective_days(
            other.days,
            other.schedule_type,
        )
    ):
        return False

    start_a = _parse_time(
        template.time_from
    )

    end_a = _parse_time(
        template.time_to
    )

    start_b = _parse_time(
        other.time_from
    )

    end_b = _parse_time(
        other.time_to
    )

    # If time is incomplete,
    # assume conflict to be safe.
    if (
        not start_a
        or not end_a
        or not start_b
        or not end_b
    ):
        return True

    return (
        start_a < end_b
        and start_b < end_a
    )


def _conflicting_active_batch(
    template: RegistrarScheduleTemplate,
    *,
    exclude_id: int | None = None,
):
    """
    Find another ACTIVE batch using the same trainer
    with an overlapping schedule.
    """

    qs = RegistrarScheduleTemplate.objects.filter(
        status=RegistrarScheduleTemplate.Status.ACTIVE,
    )

    if exclude_id:
        qs = qs.exclude(
            pk=exclude_id
        )

    trainer_name = (
        template.trainer_name
        or ""
    ).strip()

    trainer_req_id = (
        template.trainer_request_id
    )

    if trainer_req_id:

        qs = qs.filter(
            trainer_request_id=trainer_req_id
        )

    elif trainer_name:

        qs = qs.filter(
            trainer_name__iexact=trainer_name
        )

    else:
        return None

    for existing in qs:

        if _schedule_conflicts(
            template,
            existing,
        ):
            return existing

    return None


def _students_for_course(
    course_name: str,
    *,
    batch_kind: str = BatchKind.TRAINING,
) -> list[dict]:
    """
    Students eligible to be placed
    in the next batch.
    """

    return available_students_for_course(
        course_name,
        batch_kind=batch_kind,
    )


def _students_for_template(
    t: RegistrarScheduleTemplate,
) -> list[dict]:
    """
    Active batches use their saved student snapshot.

    Draft batches dynamically load currently
    available students.
    """

    if (
        t.status
        == RegistrarScheduleTemplate.Status.ACTIVE
        and isinstance(
            t.students_snapshot,
            list,
        )
    ):
        return t.students_snapshot

    return _students_for_course(
        t.course_name,
        batch_kind=t.batch_kind,
    )


# ================================================================
# STUDENT COMPETENCY STATUS
# ================================================================


def _add_competency_status_to_students(
    students: list[dict],
    course_name: str,
) -> list[dict]:
    """
    Add the student's actual institutional
    competency status based on the latest
    TrainerStudentGrade record and EGACE logic.
    """

    result = []

    for student in students:

        student_data = dict(
            student
        )

        first_name = (
            student.get("firstName")
            or student.get("first_name")
            or ""
        ).strip()

        last_name = (
            student.get("lastName")
            or student.get("last_name")
            or ""
        ).strip()

        program = (
            student.get("program")
            or course_name
            or ""
        ).strip()

        registration = (
            StudentRegistration.objects.filter(
                status=(
                    StudentRegistration.Status.APPROVED
                ),
                selected_program=program,
                first_name__iexact=first_name,
                last_name__iexact=last_name,
            )
            .order_by(
                "-created_at"
            )
            .first()
        )

        if not registration:

            student_data[
                "competencyStatus"
            ] = "Not Yet Competent"

            result.append(
                student_data
            )

            continue

        payload = grade_payload_for_registration(
            registration
        )

        is_competent = student_is_graduate(
            payload,
            program,
        )

        student_data[
            "competencyStatus"
        ] = (
            "Competent"
            if is_competent
            else "Not Yet Competent"
        )

        result.append(
            student_data
        )

    return result


# ================================================================
# SERIALIZATION
# ================================================================


def _serialize_template(
    t: RegistrarScheduleTemplate,
):

    students = _students_for_template(
        t
    )

    students = _add_competency_status_to_students(
        students,
        t.course_name,
    )

    return {
        "id": str(
            t.pk
        ),

        "name": (
            t.name
            or ""
        ),

        "courseId": t.course_id,

        "courseName": t.course_name,

        "scheduleType": t.schedule_type,

        "days": (
            t.days
            if isinstance(
                t.days,
                list,
            )
            else []
        ),

        "timeFrom": t.time_from,

        "timeTo": t.time_to,

        "dailyHours": float(
            t.daily_hours
            or 0
        ),

        "availableFrom": _format_optional_date(
            t.available_from
        ),

        "availableUntil": _format_optional_date(
            t.available_until
        ),

        "trainerId": (
            str(
                t.trainer_request_id
            )
            if t.trainer_request_id
            else ""
        ),

        "trainerName": (
            t.trainer_name
            or ""
        ),

        "batchLabel": (
            t.batch_label
            or "Batch 1"
        ),

        "batchKind": (
            t.batch_kind
            or BatchKind.TRAINING.value
        ),

        "category": (
            BATCHING_CATEGORY_NATIONAL
            if (
                t.batch_kind
                == BatchKind.NATIONAL_ASSESSMENT
            )
            else BATCHING_CATEGORY_INSTITUTIONAL
        ),

        # This is now expected to be:
        # "draft" or "active"
        "status": t.status,

        # Keep this database field for now.
        # The frontend can display it as "Activated".
        "finalizedAt": (
            t.finalized_at.isoformat()
            if t.finalized_at
            else ""
        ),

        "durationDays": COURSE_DURATIONS.get(
            t.course_name,
            0,
        ),

        "studentCount": len(
            students
        ),

        "students": students,

        "startDate": _format_optional_date(
            t.available_from
        ),

        "endDate": _format_optional_date(
            t.available_until
        ),

        "trainer": (
            t.trainer_name
            or ""
        ),

        "schedule": {
            "day": _schedule_display(
                t.days
                if isinstance(
                    t.days,
                    list,
                )
                else [],
                t.schedule_type,
            ),

            "timeFrom": t.time_from,

            "timeTo": t.time_to,
        },
    }


def _serialize_batch_card(
    t: RegistrarScheduleTemplate,
):
    """
    Payload for the Active/Draft Batches
    repository page.
    """

    data = _serialize_template(
        t
    )

    return {
        "id": data["id"],

        "courseId": data["courseId"],

        "courseName": data["courseName"],

        "batchLabel": data["batchLabel"],

        "batchId": "b1",

        "durationDays": data["durationDays"],

        "schedule": data["schedule"],

        "startDate": data["startDate"],

        "endDate": data["endDate"],

        "trainer": data["trainer"],

        "students": data["students"],

        "studentCount": data["studentCount"],

        "status": data["status"],

        "finalizedAt": data["finalizedAt"],

        "name": data["name"],

        "batchKind": data["batchKind"],

        "category": data["category"],
    }


# ================================================================
# PAYLOADS
# ================================================================


def batching_templates_payload():

    grouped = {}

    for t in (
        RegistrarScheduleTemplate.objects.all()
        .order_by(
            "-updated_at",
            "-created_at",
        )
    ):

        grouped.setdefault(
            t.course_id,
            [],
        ).append(
            _serialize_template(t)
        )

    return grouped


def batching_batches_payload():

    return [
        _serialize_batch_card(t)
        for t in (
            RegistrarScheduleTemplate.objects.all()
            .order_by(
                "-updated_at",
                "-created_at",
            )
        )
    ]


# ================================================================
# GET ALL BATCHES
# ================================================================


@login_required(login_url="/")
@require_http_methods(["GET"])
def batching_batches_list(request):

    denied = require_portal_access(
        request,
        REGISTRAR_ROLE,
    )

    if denied:
        return denied

    return JsonResponse(
        {
            "batches": batching_batches_payload()
        }
    )


# ================================================================
# ACTIVATE BATCH
# ================================================================


@login_required(login_url="/")
@require_http_methods(["POST"])
def batching_template_finalize(
    request,
    template_id,
):

    denied = require_portal_access(
        request,
        REGISTRAR_ROLE,
    )

    if denied:
        return denied

    db_template_id = _parse_template_db_id(
        template_id
    )

    if db_template_id is None:

        return JsonResponse(
            {
                "error": "Template not found."
            },
            status=404,
        )

    try:

        obj = RegistrarScheduleTemplate.objects.get(
            pk=db_template_id
        )

    except RegistrarScheduleTemplate.DoesNotExist:

        return JsonResponse(
            {
                "error": "Template not found."
            },
            status=404,
        )

    # ---------------------------------------------------------
    # ALREADY ACTIVE
    # ---------------------------------------------------------

    if (
        obj.status
        == RegistrarScheduleTemplate.Status.ACTIVE
    ):

        return JsonResponse(
            {
                "error": "This batch is already active."
            },
            status=400,
        )

    # ---------------------------------------------------------
    # GET STUDENTS
    # ---------------------------------------------------------

    students = _students_for_course(
        obj.course_name,
        batch_kind=obj.batch_kind,
    )

    # ---------------------------------------------------------
    # MINIMUM STUDENTS
    # ---------------------------------------------------------

    if len(students) < MIN_STUDENTS_TO_ACTIVATE:

        return JsonResponse(
            {
                "error": (
                    f"At least "
                    f"{MIN_STUDENTS_TO_ACTIVATE} "
                    f"approved students are required "
                    f"before activating this batch "
                    f"(currently {len(students)})."
                )
            },
            status=400,
        )

    # ---------------------------------------------------------
    # TRAINER REQUIRED
    # ---------------------------------------------------------

    if not obj.trainer_name:

        return JsonResponse(
            {
                "error": (
                    "Assign a trainer before "
                    "activating this batch."
                )
            },
            status=400,
        )

    # ---------------------------------------------------------
    # CHECK TRAINER SCHEDULE CONFLICT
    # ---------------------------------------------------------

    conflict = _conflicting_active_batch(
        obj,
        exclude_id=obj.pk,
    )

    if conflict:

        return JsonResponse(
            {
                "error": (
                    "Schedule conflict: trainer is "
                    "already assigned to "
                    f"{conflict.course_name} "
                    f"({conflict.batch_label or 'Batch 1'}) "
                    "on overlapping day/time."
                )
            },
            status=400,
        )

    # ---------------------------------------------------------
    # SAVE STUDENT SNAPSHOT
    # ---------------------------------------------------------

    obj.students_snapshot = students

    # ---------------------------------------------------------
    # DRAFT → ACTIVE
    # ---------------------------------------------------------

    obj.status = (
        RegistrarScheduleTemplate.Status.ACTIVE
    )

    # Keep existing database field for compatibility.
    obj.finalized_at = timezone.now()

    obj.save(
        update_fields=[
            "students_snapshot",
            "status",
            "finalized_at",
            "updated_at",
        ]
    )

    # ---------------------------------------------------------
    # ASSIGN STUDENTS TO BATCH
    # ---------------------------------------------------------

    from .batch_schedule_sync import (
        assign_finalized_template_to_students,
    )

    assigned_count = (
        assign_finalized_template_to_students(
            obj,
            assigned_by=(
                request.user.get_full_name()
                or request.user.email
                or "Registrar"
            ),
        )
    )

    # ---------------------------------------------------------
    # RETURN UPDATED CARD
    # ---------------------------------------------------------

    batch_payload = _serialize_batch_card(
        obj
    )

    batch_payload[
        "studentsAssigned"
    ] = assigned_count

    return JsonResponse(
        {
            "ok": True,
            "batch": batch_payload,
        }
    )


# ================================================================
# CREATE / UPDATE DRAFT
# ================================================================


@login_required(login_url="/")
@require_http_methods(["POST"])
def batching_template_upsert(request):

    denied = require_portal_access(
        request,
        REGISTRAR_ROLE,
    )

    if denied:
        return denied

    data = request.POST

    template_id = (
        data.get(
            "id",
            "",
        ).strip()
    )

    course_id = (
        data.get(
            "course_id",
            "",
        ).strip()
    )

    course_name = (
        data.get(
            "course_name",
            "",
        ).strip()
    )

    if (
        not course_id
        or not course_name
    ):

        return JsonResponse(
            {
                "error": "Course is required."
            },
            status=400,
        )

    # ---------------------------------------------------------
    # TRAINER
    # ---------------------------------------------------------

    trainer_id = (
        data.get(
            "trainer_request_id",
            "",
        ).strip()
        or None
    )

    trainer = None

    if trainer_id:

        try:

            trainer = (
                TrainerAccountRequest.objects.get(
                    pk=trainer_id
                )
            )

        except TrainerAccountRequest.DoesNotExist:

            return JsonResponse(
                {
                    "error": "Trainer not found."
                },
                status=400,
            )

    # ---------------------------------------------------------
    # FIND EXISTING TEMPLATE
    # ---------------------------------------------------------

    obj = None

    db_template_id = _parse_template_db_id(
        template_id
    )

    if db_template_id is not None:

        try:

            obj = (
                RegistrarScheduleTemplate.objects.get(
                    pk=db_template_id
                )
            )

        except RegistrarScheduleTemplate.DoesNotExist:

            return JsonResponse(
                {
                    "error": "Template not found."
                },
                status=404,
            )

        # -----------------------------------------------------
        # ACTIVE BATCHES ARE LOCKED
        # -----------------------------------------------------

        if (
            obj.status
            == RegistrarScheduleTemplate.Status.ACTIVE
        ):

            return JsonResponse(
                {
                    "error": (
                        "Active batches cannot be edited. "
                        "View them in Active Batches."
                    )
                },
                status=400,
            )

    # ---------------------------------------------------------
    # CREATE NEW DRAFT
    # ---------------------------------------------------------

    if obj is None:

        obj = RegistrarScheduleTemplate(
            created_by=request.user
        )

    # ---------------------------------------------------------
    # BATCH KIND
    # ---------------------------------------------------------

    batch_kind = (
        data.get(
            "batch_kind"
        )
        or BatchKind.TRAINING
    ).strip()

    if batch_kind not in {
        BatchKind.TRAINING,
        BatchKind.NATIONAL_ASSESSMENT,
    }:

        batch_kind = BatchKind.TRAINING

    # ---------------------------------------------------------
    # BASIC INFORMATION
    # ---------------------------------------------------------

    obj.course_id = course_id

    obj.course_name = course_name

    obj.batch_kind = batch_kind

    obj.name = (
        data.get(
            "name",
            "",
        ).strip()
    )

    # ---------------------------------------------------------
    # SCHEDULE
    # ---------------------------------------------------------

    obj.schedule_type = (
        data.get(
            "schedule_type",
            "",
        ).strip()
    )

    obj.days = data.getlist(
        "days"
    )

    obj.time_from = (
        data.get(
            "time_from",
            "",
        ).strip()
    )

    obj.time_to = (
        data.get(
            "time_to",
            "",
        ).strip()
    )

    obj.daily_hours = Decimal(
        data.get(
            "daily_hours",
            "0",
        )
        or "0"
    )

    # ---------------------------------------------------------
    # DATES
    # ---------------------------------------------------------

    obj.available_from = (
        _parse_optional_date(
            data.get(
                "available_from"
            )
        )
    )

    obj.available_until = (
        _parse_optional_date(
            data.get(
                "available_until"
            )
        )
    )

    # ---------------------------------------------------------
    # ASSESSMENT
    # ---------------------------------------------------------

    obj.assessment_at = None

    obj.examiner_name = ""

    obj.examination_course = ""

    # ---------------------------------------------------------
    # TRAINER
    # ---------------------------------------------------------

    obj.trainer_request = trainer

    obj.trainer_name = (
        data.get(
            "trainer_name",
            "",
        ).strip()
    )

    # ---------------------------------------------------------
    # CHECK ACTIVE TRAINER SCHEDULE CONFLICT
    # ---------------------------------------------------------

    if (
        obj.trainer_request_id
        or obj.trainer_name
    ):

        conflict = _conflicting_active_batch(
            obj,
            exclude_id=(
                obj.pk
                if obj.pk
                else None
            ),
        )

        if conflict:

            return JsonResponse(
                {
                    "error": (
                        "Schedule conflict: trainer is "
                        "already assigned to "
                        f"{conflict.course_name} "
                        f"({conflict.batch_label or 'Batch 1'}) "
                        "on overlapping day/time."
                    )
                },
                status=400,
            )

    # ---------------------------------------------------------
    # SAVE
    # ---------------------------------------------------------

    obj.save()

    return JsonResponse(
        {
            "ok": True,
            "template": _serialize_template(
                obj
            ),
        }
    )


# ================================================================
# DELETE DRAFT
# ================================================================


@login_required(login_url="/")
@require_http_methods(["POST"])
def batching_template_delete(
    request,
    template_id,
):

    denied = require_portal_access(
        request,
        REGISTRAR_ROLE,
    )

    if denied:
        return denied

    db_template_id = _parse_template_db_id(
        template_id
    )

    if db_template_id is None:

        return JsonResponse(
            {
                "error": "Template not found."
            },
            status=404,
        )

    try:

        obj = (
            RegistrarScheduleTemplate.objects.get(
                pk=db_template_id
            )
        )

    except RegistrarScheduleTemplate.DoesNotExist:

        return JsonResponse(
            {
                "error": "Template not found."
            },
            status=404,
        )

    # ---------------------------------------------------------
    # ACTIVE BATCHES CANNOT BE DELETED
    # ---------------------------------------------------------

    if (
        obj.status
        == RegistrarScheduleTemplate.Status.ACTIVE
    ):

        return JsonResponse(
            {
                "error": (
                    "Active batches cannot be deleted."
                )
            },
            status=400,
        )

    # ---------------------------------------------------------
    # DELETE DRAFT
    # ---------------------------------------------------------

    obj.delete()

    return JsonResponse(
        {
            "ok": True,
            "template_id": str(
                db_template_id
            ),
        }
    )