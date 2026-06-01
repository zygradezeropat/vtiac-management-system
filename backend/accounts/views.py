from django.shortcuts import redirect, render

from .services import handle_portal_login_post, handle_portal_logout, login_page_context


def login_page(request, role):
    if request.method == "POST":
        return handle_portal_login_post(request, role)
    return render(request, "auth/login.html", login_page_context(role))


def portal_logout(request):
    return handle_portal_logout(request)
