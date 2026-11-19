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
    is_student_user = bool(user.is_authenticated and (portal_role == "student" or hasattr(user, "student_profile")))
    is_enrolled = False
    is_assessment_only = False
    portal_role_label = ""
    enrollment_notification = None

    if is_student_user:
        from backend.student.services import (
            get_enrollment_profile,
            registration_is_enrolled,
            is_assessment_only_user,
        )

        is_assessment_only = is_assessment_only_user(user)
        portal_role_label = "Candidate" if is_assessment_only else "Student"
        is_enrolled = registration_is_enrolled(user)
        if not is_enrolled:
            reg = getattr(user, "registration_application", None)
            profile = get_enrollment_profile(user)

            if not profile or not profile.profile_step_completed:
                stage_key = "profile_incomplete"
                stage_badge = "Action Required"
                if is_assessment_only:
                    stage_desc = (
                        "Your account has been created, but your assessment application is incomplete. "
                        "Please fill out the TESDA Application Form and upload your documentary requirements so the assessment center can verify and schedule your assessment."
                    )
                    action_url = "/dashboard/student/enrollment/"
                    action_label = "Complete Application"
                else:
                    stage_desc = (
                        "Your registration has been submitted, but your enrollment is incomplete. "
                        "Please fill out your learner profile and upload documentary requirements so the registrar can verify and approve your enrollment."
                    )
                    action_url = "/dashboard/student/enrollment/"
                    action_label = "Complete Enrollment"
            elif not profile.requirements_submitted:
                stage_key = "requirements_pending"
                stage_badge = "Documents Needed"
                if is_assessment_only:
                    stage_desc = (
                        "Your TESDA Application Form is saved, but you have not yet uploaded your required documents. "
                        "Please upload all required files so the assessment center can proceed with your evaluation."
                    )
                    action_url = "/dashboard/student/enrollment/requirements/"
                    action_label = "Upload Requirements"
                else:
                    stage_desc = (
                        "Your learner profile is saved, but you have not yet uploaded your required documents. "
                        "Please upload all required files so the registrar can proceed with your evaluation."
                    )
                    action_url = "/dashboard/student/enrollment/requirements/"
                    action_label = "Upload Requirements"
            elif reg and reg.status == "rejected":
                stage_key = "rejected"
                stage_badge = "Application Needs Attention"
                if is_assessment_only:
                    stage_desc = (
                        "Your assessment application was not approved by the assessment center. "
                        "Please review the remarks or contact the assessment center for guidance."
                    )
                else:
                    stage_desc = (
                        "Your enrollment application was not approved by the registrar. "
                        "Please review the registrar remarks or contact the registrar office for guidance."
                    )
                action_url = "/dashboard/student/enrollment/pending/"
                action_label = "View Remarks"
            else:
                stage_key = "under_review"
                if is_assessment_only:
                    stage_badge = "Pending Review"
                    stage_desc = (
                        "Your assessment application and requirements have been submitted and are currently awaiting review and approval. "
                        "You will receive an email confirmation once your assessment is officially scheduled."
                    )
                else:
                    stage_badge = "Pending Registrar Review"
                    stage_desc = (
                        "Your enrollment application and requirements have been submitted and are currently awaiting registrar review and approval. "
                        "You will receive an email confirmation once your enrollment is officially approved."
                    )
                action_url = "/dashboard/student/enrollment/pending/"
                action_label = "Check Status"

            enrollment_notification = {
                "is_enrolled": False,
                "title": (
                    "Assessment Application Incomplete"
                    if is_assessment_only
                    else "You are not yet enrolled."
                ),
                "badge": stage_badge,
                "description": stage_desc,
                "stage": stage_key,
                "action_url": action_url,
                "action_label": action_label,
            }
        else:
            enrollment_notification = {
                "is_enrolled": True,
                "title": "Assessment Application Approved" if is_assessment_only else "Officially Enrolled",
                "badge": "Scheduled" if is_assessment_only else "Enrolled",
                "stage": "enrolled",
            }

    staff_allowed_portals = []
    can_switch_portal = False
    substitute_badge_label = ""
    if user.is_authenticated and hasattr(user, "staff_profile"):
        from backend.core.models import StaffProfile

        allowed = user.staff_profile.get_allowed_roles()
        can_switch_portal = len(allowed) > 1
        exp = user.staff_profile.additional_roles_expires_at
        if exp and can_switch_portal:
            from django.utils import timezone

            now = timezone.now()
            if exp > now:
                hrs = max(1, int((exp - now).total_seconds() // 3600))
                substitute_badge_label = f"1-Day Sub ({hrs}h left)"
            else:
                substitute_badge_label = "Expired"

        role_labels = {
            StaffProfile.Role.ADMIN: "Admin",
            StaffProfile.Role.REGISTRAR: "Registrar",
            StaffProfile.Role.CASHIER: "Cashier",
            StaffProfile.Role.TRAINER: "Trainer",
        }
        for r in [
            StaffProfile.Role.ADMIN,
            StaffProfile.Role.REGISTRAR,
            StaffProfile.Role.CASHIER,
            StaffProfile.Role.TRAINER,
        ]:
            if r in allowed:
                staff_allowed_portals.append({
                    "role": r,
                    "label": role_labels.get(r, r.title()),
                    "is_active": portal_role == r,
                    "url": f"/portal/switch/{r}/",
                })

    return {
        "portal_user": user if user.is_authenticated else None,
        "portal_user_email": email,
        "portal_display_name": display,
        "portal_initials": initials,
        "portal_role": portal_role,
        "portal_role_label": portal_role_label,
        "is_student_user": is_student_user,
        "is_enrolled": is_enrolled,
        "is_assessment_only": is_assessment_only,
        "enrollment_notification": enrollment_notification,
        "staff_allowed_portals": staff_allowed_portals,
        "can_switch_portal": can_switch_portal,
        "substitute_badge_label": substitute_badge_label,
    }

