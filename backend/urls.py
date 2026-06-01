"""
URL configuration for backend project.
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("", include("backend.core.urls")),
    path("", include("backend.student.urls")),
    path("", include("backend.accounts.urls")),
    path("", include("backend.registrar.urls")),
    path("", include("backend.cashier.urls")),
    path("", include("backend.trainer.urls")),
    path("", include("backend.system_admin.urls")),
    path("admin/", admin.site.urls),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0])
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
