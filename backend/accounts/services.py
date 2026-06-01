
from django.contrib import messages
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.shortcuts import redirect

from backend.core.models import StaffProfile
from backend.core.services import STAFF_LOGIN_ROLES, landing_context
from backend.student.models import StudentProfile

User = get_user_model()

STUDENT_ROLE = "student"
LOGIN_CREDENTIALS_ERROR = "Incorrect password/email, please try again."
STAFF_ROLES = frozenset(
    {
        StaffProfile.Role.REGISTRAR,
        StaffProfile.Role.CASHIER,
        StaffProfile.Role.TRAINER,
        StaffProfile.Role.ADMIN,
    }
)
PORTAL_ROLES = STAFF_ROLES | {STUDENT_ROLE}

ROLE_TITLES = {
    "registrar": "Registrar",
    "cashier": "Cashier",
    "trainer": "Trainer",
    "admin": "Admin",
    "student": "Student",
}

LOGIN_PORTAL_COPY = {
    "student": {
        "help_title": "Student Login",
        "help_text": (
            "Use the email and password you set during registration. "
            "New here? Register first, then return to sign in."
        ),
        "help_link_register": True,
    },
    "registrar": {
        "help_title": "Registrar Login",
        "help_text": "Sign in with your registrar staff account. Sample credentials are shown below for testing.",
        "help_link_register": False,
    },
    "cashier": {
        "help_title": "Cashier Login",
        "help_text": "Sign in with your cashier staff account. Sample credentials are shown below for testing.",
        "help_link_register": False,
    },
    "trainer": {
        "help_title": "Trainer Login",
        "help_text": "Sign in with your trainer staff account. Sample credentials are shown below for testing.",
        "help_link_register": False,
        "account_request_prompt": "Don't have an account?",
        "account_request_link_label": "Register here",
    },
    "admin": {
        "help_title": "Admin Login",
        "help_text": "Sign in with your system admin staff account. Sample credentials are shown below for testing.",
        "help_link_register": False,
    },
}


DASHBOARD_URL_NAMES = {
    STUDENT_ROLE: "student_dashboard",
    StaffProfile.Role.REGISTRAR: "dashboard_registrar_redirect",
    StaffProfile.Role.CASHIER: "cashier_dashboard",
    StaffProfile.Role.TRAINER: "trainer_dashboard",
    StaffProfile.Role.ADMIN: "admin_dashboard",
}


def dashboard_url_name(role):
    return DASHBOARD_URL_NAMES.get((role or "").lower())


def redirect_to_dashboard(role):
    url_name = dashboard_url_name(role)
    if url_name:
        return redirect(url_name)
    return redirect("landing")


def require_portal_access(request, role):
    role = (role or "").lower()
    if not request.user.is_authenticated:
        messages.error(request, "Please sign in to continue.")
        return redirect("login", role=role)

    session_role = request.session.get("portal_role")
    if session_role != role:
        if session_role in PORTAL_ROLES:
            return redirect_to_dashboard(session_role)
        return redirect("login", role=role)

    if role == STUDENT_ROLE:
        if not StudentProfile.objects.filter(user=request.user).exists():
            messages.error(request, "This account is not set up for student portal access.")
            return redirect("login", role=STUDENT_ROLE)
        return None

    if role not in STAFF_ROLES:
        return redirect("landing")

    try:
        profile = request.user.staff_profile
    except StaffProfile.DoesNotExist:
        messages.error(request, "This account is not set up for staff portal access.")
        return redirect("login", role=role)

    if profile.role != role:
        messages.error(
            request,
            f"This account is registered as {profile.get_role_display()}, not {role}.",
        )
        return redirect("login", role=role)

    return None


def login_page_context(role):
    role = (role or "").lower()
    role_title = ROLE_TITLES.get(role, "Student")
    copy = LOGIN_PORTAL_COPY.get(role, LOGIN_PORTAL_COPY["student"])
    return {
        "role": role,
        "role_title": role_title,
        "portal_label": f"{role_title} Portal",
        "card_title": f"{role_title} Login",
        "submit_label": f"Login as {role_title}",
        "help_title": copy["help_title"],
        "help_text": copy["help_text"],
        "help_link_register": copy.get("help_link_register", False),
        "account_request_prompt": copy.get("account_request_prompt", ""),
        "account_request_link_label": copy.get("account_request_link_label", ""),
        "show_account_request_link": bool(copy.get("account_request_link_label")),
        "is_staff_role": role in STAFF_ROLES,
        "can_login": role in PORTAL_ROLES,
        **landing_context(
            active_staff_role=role if role in STAFF_ROLES else None,
        ),
    }


def handle_portal_login_post(request, role):
    role = (role or "").lower()
    if role not in PORTAL_ROLES:
        messages.error(request, "Invalid portal role.")
        return redirect("landing")

    email = request.POST.get("email", "").strip().lower()
    password = request.POST.get("password", "")

    if not email or not password:
        messages.error(request, LOGIN_CREDENTIALS_ERROR)
        return redirect("login", role=role)

    user = authenticate(request, username=email, password=password)
    if user is None:
        try:
            candidate = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            messages.error(request, LOGIN_CREDENTIALS_ERROR)
            return redirect("login", role=role)
        if not candidate.check_password(password):
            messages.error(request, LOGIN_CREDENTIALS_ERROR)
            return redirect("login", role=role)
        user = candidate

    if not user.is_active:
        messages.error(request, LOGIN_CREDENTIALS_ERROR)
        return redirect("login", role=role)

    if role == STUDENT_ROLE:
        if not StudentProfile.objects.filter(user=user).exists():
            messages.error(request, LOGIN_CREDENTIALS_ERROR)
            return redirect("login", role=role)
    else:
        try:
            profile = user.staff_profile
        except StaffProfile.DoesNotExist:
            messages.error(request, LOGIN_CREDENTIALS_ERROR)
            return redirect("login", role=role)
        if profile.role != role:
            messages.error(request, LOGIN_CREDENTIALS_ERROR)
            return redirect("login", role=role)

    login(request, user)
    request.session["portal_role"] = role
    return redirect_to_dashboard(role)


def handle_portal_logout(request):
    logout(request)
    request.session.flush()
    messages.success(request, "You have been signed out.")
    return redirect("landing")
