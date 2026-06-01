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

    return {
        "portal_user_email": email,
        "portal_display_name": display,
        "portal_initials": initials,
        "portal_role": request.session.get("portal_role", ""),
    }
