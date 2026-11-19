from django.urls import path

from . import views

urlpatterns = [
    path("login/<str:role>/", views.login_page, name="login"),
    path("logout/", views.portal_logout, name="logout"),
    path("portal/switch/<str:role>/", views.switch_portal, name="switch_portal"),
]
