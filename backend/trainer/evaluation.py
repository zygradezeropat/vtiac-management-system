"""
Trainer Evaluation service layer.
Handles evaluation criteria, student submissions, and trainer feedback aggregation.
"""

from decimal import Decimal
from django.contrib.auth import get_user_model
from django.db import models, transaction
from django.utils import timezone

from backend.trainer.models import (
    TrainerEvaluation,
    TrainerEvaluationQuestion,
    TrainerEvaluationResponse,
)

User = get_user_model()

# The 3 core evaluation criteria as defined by school standards
EVALUATION_CRITERIA = [
    {
        "id": 1,
        "key": "instructional_delivery",
        "category": "Instructional Delivery",
        "title": "Instructional Delivery",
        "description": (
            "Mastery of trade skills, application of CBT methodology "
            "(acting as a facilitator rather than just a lecturer), use of appropriate "
            "training methods, and ability to address diverse learner needs."
        ),
    },
    {
        "id": 2,
        "key": "classroom_facility_management",
        "category": "Classroom and Facility Management",
        "title": "Classroom and Facility Management",
        "description": (
            "Monitoring of work activities, maintenance and safety of training "
            "facilities, tools, and equipment, and handling of support staff."
        ),
    },
    {
        "id": 3,
        "key": "communication_professionalism",
        "category": "Communication and Professionalism",
        "title": "Communication and Professionalism",
        "description": (
            "Clarity of explanations, fairness in giving feedback, patience, and rapport with trainees."
        ),
    },
]


def ensure_evaluation_questions():
    """
    Ensure the 3 standard evaluation criteria questions exist in the database.
    Deactivates any legacy questions not matching these 3 criteria.
    """
    questions_map = {}
    for crit in EVALUATION_CRITERIA:
        q_obj, created = TrainerEvaluationQuestion.objects.get_or_create(
            order=crit["id"],
            defaults={
                "category": crit["category"],
                "question": crit["description"],
                "is_active": True,
            },
        )
        if not created:
            changed = False
            if q_obj.category != crit["category"]:
                q_obj.category = crit["category"]
                changed = True
            if q_obj.question != crit["description"]:
                q_obj.question = crit["description"]
                changed = True
            if not q_obj.is_active:
                q_obj.is_active = True
                changed = True
            if changed:
                q_obj.save(update_fields=["category", "question", "is_active"])
        questions_map[crit["id"]] = q_obj

    # Deactivate older questions with order > 3 or obsolete ones
    TrainerEvaluationQuestion.objects.filter(order__gt=3).update(is_active=False)
    return questions_map


def resolve_student_evaluation_target(student_user):
    """
    Resolve the assigned trainer and class information for the student.
    Returns a dict with trainer User, trainer display name, program, batch, and schedule.
    """
    from backend.core.models import StaffProfile
    from backend.student.services import get_enrollment_profile

    trainer_user = None
    trainer_name = ""
    course_name = ""
    batch_label = ""
    schedule_display = "—"

    profile = get_enrollment_profile(student_user) if student_user else None
    if profile:
        if profile.selected_program:
            course_name = profile.selected_program
        pref = profile.preferred_schedule
        if pref:
            if pref.course_name:
                course_name = pref.course_name
            if pref.batch_label:
                batch_label = pref.batch_label
            if pref.trainer:
                trainer_name = pref.trainer

            # Schedule dates display
            if pref.start_date and pref.end_date:
                start_str = pref.start_date.strftime("%B %d")
                end_str = pref.end_date.strftime("%B %d, %Y")
                schedule_display = f"{start_str} - {end_str}"
            elif pref.label:
                schedule_display = pref.label
        elif getattr(student_user, "registration_application", None):
            reg = student_user.registration_application
            if reg.selected_program:
                course_name = reg.selected_program

    # Resolve trainer User object
    # 1. Match by trainer_name if available
    trainer_candidates = User.objects.filter(staff_profile__role=StaffProfile.Role.TRAINER)
    if trainer_name:
        for t_user in trainer_candidates:
            full_name = t_user.get_full_name() or ""
            if (
                full_name.strip().lower() == trainer_name.strip().lower()
                or trainer_name.strip().lower() in full_name.strip().lower()
            ):
                trainer_user = t_user
                break

    # 2. If no direct name match, look up trainer from schedule template
    if not trainer_user and profile and course_name:
        from backend.registrar.models import RegistrarScheduleTemplate
        template = RegistrarScheduleTemplate.objects.filter(
            course_name=course_name,
            status__in=[
                RegistrarScheduleTemplate.Status.ACTIVE,
                RegistrarScheduleTemplate.Status.COMPLETED,
            ],
        ).order_by("-finalized_at").first()
        if template and template.trainer_name:
            trainer_name = template.trainer_name
            for t_user in trainer_candidates:
                if t_user.get_full_name().strip().lower() == trainer_name.strip().lower():
                    trainer_user = t_user
                    break

    # 3. Fallback to first trainer in DB
    if not trainer_user:
        first_trainer = trainer_candidates.first()
        if first_trainer:
            trainer_user = first_trainer
            trainer_name = first_trainer.get_full_name() or first_trainer.email
        else:
            trainer_user = None
            trainer_name = "Unassigned Trainer"

    return {
        "trainer_user": trainer_user,
        "trainer_name": trainer_name,
        "trainer_id": str(trainer_user.pk) if trainer_user else "",
        "program": course_name,
        "batch": batch_label,
        "training_schedule": schedule_display,
    }


def save_student_trainer_evaluation(student_user, post_data):
    """
    Save a student's evaluation of their trainer for the 3 core criteria:
    1. Instructional Delivery (1-5)
    2. Classroom and Facility Management (1-5)
    3. Communication and Professionalism (1-5)
    """
    if not student_user or not getattr(student_user, "is_authenticated", False):
        raise ValueError("Authenticated student user is required.")

    target_info = resolve_student_evaluation_target(student_user)
    trainer_user = target_info["trainer_user"]

    # Check if a specific trainer_id was passed in POST
    post_trainer_id = (post_data.get("trainer_id") or "").strip()
    if post_trainer_id:
        custom_trainer = User.objects.filter(pk=post_trainer_id).first()
        if custom_trainer:
            trainer_user = custom_trainer

    if not trainer_user:
        raise ValueError("No designated trainer found to evaluate.")

    # Enforce one-time evaluation: check if student has already evaluated this trainer
    existing_eval = TrainerEvaluation.objects.filter(
        student=student_user,
        trainer=trainer_user,
    ).first()
    if existing_eval:
        raise ValueError(
            f"You have already submitted an evaluation for {target_info['trainer_name']}. Only one evaluation is allowed."
        )

    # Parse and validate the 3 criteria ratings (1-5)
    ratings = []
    # q1: Instructional Delivery
    # q2: Classroom and Facility Management
    # q3: Communication and Professionalism
    for idx in range(1, 4):
        val = post_data.get(f"q{idx}") or post_data.get(EVALUATION_CRITERIA[idx - 1]["key"])
        if val is None:
            # Default to 5 if not submitted
            val = 5
        try:
            rating_int = int(val)
            rating_int = max(1, min(5, rating_int))
        except (ValueError, TypeError):
            rating_int = 5
        ratings.append(rating_int)

    overall_avg = round(sum(ratings) / len(ratings), 2)
    comments = post_data.get("comments", "").strip()

    course_name = (
        post_data.get("course_name")
        or target_info["program"]
        or "Vocational Training Program"
    ).strip()
    batch_label = (
        post_data.get("batch_label")
        or target_info["batch"]
        or ""
    ).strip()

    questions_map = ensure_evaluation_questions()

    with transaction.atomic():
        evaluation = TrainerEvaluation.objects.create(
            student=student_user,
            trainer=trainer_user,
            course_name=course_name,
            batch_label=batch_label,
            overall_rating=overall_avg,
            comments=comments,
        )

        for idx, rating_val in enumerate(ratings, 1):
            q_obj = questions_map.get(idx) or TrainerEvaluationQuestion.objects.get(order=idx)
            TrainerEvaluationResponse.objects.create(
                evaluation=evaluation,
                question=q_obj,
                rating=rating_val,
            )

    return evaluation


def get_student_evaluation_history(student_user):
    """
    Retrieve evaluation history submitted by this student.
    Returns formatted list for the student history tab.
    """
    if not student_user or not getattr(student_user, "is_authenticated", False):
        return []

    ensure_evaluation_questions()

    evals = (
        TrainerEvaluation.objects.filter(student=student_user)
        .select_related("trainer")
        .prefetch_related("responses__question")
        .order_by("-submitted_at")
    )

    history_list = []
    for ev in evals:
        # Build category breakdown
        responses = {r.question.order: r.rating for r in ev.responses.all()}
        breakdown = [
            {
                "category": crit["category"],
                "rating": responses.get(crit["id"], int(ev.overall_rating)),
            }
            for crit in EVALUATION_CRITERIA
        ]

        trainer_name = (
            ev.trainer.get_full_name()
            or getattr(ev.trainer, "first_name", "")
            or ev.trainer.email
            or "Assigned Trainer"
        )
        course_name = ev.course_name or "Automotive Servicing NC I"
        if ev.batch_label:
            course_name = f"{course_name} - {ev.batch_label}"

        history_list.append({
            "id": str(ev.pk),
            "trainer_name": trainer_name,
            "course_name": course_name,
            "period": ev.submitted_at.strftime("%B %d, %Y"),
            "eval_type": "Student (SET)",
            "rating_avg": f"{ev.overall_rating:.1f}",
            "submitted_date": ev.submitted_at.strftime("%B %d, %Y"),
            "comments": ev.comments or "No additional comments provided.",
            "breakdown": breakdown,
        })

    return history_list


def get_trainer_evaluation_summary(trainer_user):
    """
    Calculate summary ratings and feedback list for the Trainer POV.
    Directly computes from TrainerEvaluation and TrainerEvaluationResponse in the database.
    """
    ensure_evaluation_questions()

    evals_qs = TrainerEvaluation.objects.all()
    if trainer_user and getattr(trainer_user, "is_authenticated", False):
        # Filter for this trainer's evaluations
        evals_qs = evals_qs.filter(trainer=trainer_user)

    evals = list(
        evals_qs.select_related("student")
        .prefetch_related("responses__question")
        .order_by("-submitted_at")
    )
    total_count = len(evals)

    if total_count > 0:
        overall_avg = sum(float(e.overall_rating) for e in evals) / total_count
        overall_rating_str = f"{overall_avg:.1f}"

        # Calculate average for each of the 3 criteria
        # Query responses for these evaluations
        eval_ids = [e.pk for e in evals]
        summary_scores = []
        for crit in EVALUATION_CRITERIA:
            avg_res = TrainerEvaluationResponse.objects.filter(
                evaluation_id__in=eval_ids,
                question__order=crit["id"],
            ).aggregate(avg_score=models.Avg("rating"))["avg_score"]

            score_val = round(avg_res, 1) if avg_res is not None else round(overall_avg, 1)
            summary_scores.append({
                "category": crit["category"],
                "score": f"{score_val:.1f}",
            })

        feedback_list = []
        for idx, ev in enumerate(evals, 1):
            alias_id = str(ev.student.pk)[:4].upper() if hasattr(ev.student, "pk") else f"{idx:03d}"
            course_display = ev.course_name or "Vocational Training Program"
            if ev.batch_label:
                course_display = f"{course_display} - {ev.batch_label}"

            feedback_list.append({
                "id": str(ev.pk),
                "student_alias": f"Anonymous Student #{alias_id}",
                "badge_label": "Verified Student Enrollee",
                "rating": f"{ev.overall_rating:.1f}",
                "submitted_date": ev.submitted_at.strftime("%B %d, %Y"),
                "program": course_display,
                "comment": ev.comments or "No written feedback comments provided.",
            })

    else:
        # Default placeholder when no evaluations submitted yet for this trainer
        overall_rating_str = "0.0"
        summary_scores = [
            {"category": crit["category"], "score": "0.0"}
            for crit in EVALUATION_CRITERIA
        ]
        feedback_list = []

    # Calculate star display representation (e.g. 5 stars)
    star_rating = float(overall_rating_str) if total_count > 0 else 0.0
    full_stars = int(star_rating)
    has_half = (star_rating - full_stars) >= 0.5
    empty_stars = 5 - full_stars - (1 if has_half else 0)
    star_string = ("★" * full_stars) + ("★" if has_half else "") + ("☆" * max(0, empty_stars))

    return {
        "overall_rating": overall_rating_str,
        "star_string": star_string,
        "total_evaluations": total_count,
        "history_total": total_count,
        "summary_scores": summary_scores,
        "feedback_list": feedback_list,
    }
