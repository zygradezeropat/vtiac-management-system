def portal_user(request):
    user = request.user
    email = user.email if user.is_authenticated else ""
    display = ""
    if user.is_authenticated:
        display = user.get_full_name().strip() or email
    initials = ""
    if display:
        parts = display.split()
        initials = "".join(p[0].upper() for p in parts[:2]) or display[0].upper()

    portal_role = request.session.get("portal_role", "")
    is_student_user = bool(user.is_authenticated and portal_role == "student")
    is_enrolled = False
    enrollment_notification = None

    if is_student_user:
        from backend.student.services import (
            get_enrollment_profile,
            registration_is_enrolled,
        )

        is_enrolled = registration_is_enrolled(user)
        if not is_enrolled:
            reg = getattr(user, "registration_application", None)
            profile = get_enrollment_profile(user)

            if not profile or not profile.profile_step_completed:
                stage_key = "profile_incomplete"
                stage_badge = "Action Required"
                stage_desc = (
                    "Your registration has been submitted, but your enrollment is incomplete. "
                    "Please fill out your learner profile and upload documentary requirements so the registrar can verify and approve your enrollment."
                )
                action_url = "/dashboard/student/enrollment/"
                action_label = "Complete Enrollment"
            elif not profile.requirements_submitted:
                stage_key = "requirements_pending"
                stage_badge = "Documents Needed"
                stage_desc = (
                    "Your learner profile is saved, but you have not yet uploaded your required documents. "
                    "Please upload all required files so the registrar can proceed with your evaluation."
                )
                action_url = "/dashboard/student/enrollment/requirements/"
                action_label = "Upload Requirements"
            elif reg and reg.status == "rejected":
                stage_key = "rejected"
                stage_badge = "Application Needs Attention"
                stage_desc = (
                    "Your enrollment application was not approved by the registrar. "
                    "Please review the registrar remarks or contact the registrar office for guidance."
                )
                action_url = "/dashboard/student/enrollment/pending/"
                action_label = "View Remarks"
            else:
                stage_key = "under_review"
                stage_badge = "Pending Registrar Review"
                stage_desc = (
                    "Your enrollment application and requirements have been submitted and are currently awaiting registrar review and approval. "
                    "You will receive an email confirmation once your enrollment is officially approved."
                )
                action_url = "/dashboard/student/enrollment/pending/"
                action_label = "Check Status"

            enrollment_notification = {
                "is_enrolled": False,
                "title": "You are not yet enrolled.",
                "badge": stage_badge,
                "description": stage_desc,
                "stage": stage_key,
                "action_url": action_url,
                "action_label": action_label,
            }
        else:
            enrollment_notification = {
                "is_enrolled": True,
                "title": "Officially Enrolled",
                "badge": "Enrolled",
                "stage": "enrolled",
            }

    return {
        "portal_user": user if user.is_authenticated else None,
        "portal_user_email": email,
        "portal_display_name": display,
        "portal_initials": initials,
        "portal_role": portal_role,
        "is_student_user": is_student_user,
        "is_enrolled": is_enrolled,
        "enrollment_notification": enrollment_notification,
    }

