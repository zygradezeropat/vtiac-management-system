from django.http import JsonResponse
from django.shortcuts import render
from .services import landing_context
from .calendar_services import get_calendar_events_for_user


def landing(request):
    return render(request, "landing/index.html", landing_context())


def calendar_events_api(request):
    user = request.user if request.user.is_authenticated else None
    requested_role = (request.GET.get("role") or "").strip().lower()

    # Determine user's authentic role and scope
    effective_role = "student"
    can_see_all = False
    user_label = "Public / Guest"

    if user:
        session_role = (request.session.get("portal_role") or "").strip().lower()
        staff_profile = getattr(user, "staff_profile", None)
        staff_role = (staff_profile.role or "").strip().lower() if staff_profile else ""

        if user.is_superuser or staff_role == "admin" or session_role == "admin":
            effective_role = requested_role if requested_role in ("admin", "registrar", "trainer", "student", "candidate") else "admin"
            can_see_all = (effective_role in ("admin", "registrar"))
            user_label = "System Administrator (Full Access)" if effective_role == "admin" else f"Admin Preview ({effective_role.title()})"
        elif staff_role == "registrar" or session_role == "registrar":
            effective_role = "registrar"
            can_see_all = True
            user_label = "Registrar (Full Access)"
        elif staff_role == "cashier" or session_role == "cashier":
            effective_role = "cashier"
            can_see_all = True
            user_label = "Cashier Office"
        elif staff_role == "trainer" or session_role == "trainer":
            effective_role = "trainer"
            can_see_all = False
            user_label = f"Trainer: {user.get_full_name() or user.username}"
        else:
            from backend.student.services import is_assessment_only_user
            if is_assessment_only_user(user) or requested_role == "candidate":
                effective_role = "candidate"
                can_see_all = False
                user_label = f"Candidate: {user.get_full_name() or user.username}"
            else:
                effective_role = "student"
                can_see_all = False
                user_label = f"Student: {user.get_full_name() or user.username}"
    else:
        effective_role = requested_role or "student"
        can_see_all = False
        user_label = "Guest"

    events = get_calendar_events_for_user(user, role=effective_role)

    # Distinct programs for filter dropdown
    programs = sorted({
        e["course_name"] for e in events
        if e.get("course_name") and e.get("course_name") != "Institutional"
    })

    return JsonResponse({
        "ok": True,
        "role": effective_role,
        "can_see_all": can_see_all,
        "user_label": user_label,
        "programs": programs,
        "events": events,
    })
