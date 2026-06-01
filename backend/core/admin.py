from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

from .models import PortalNotification, StaffProfile


class StaffProfileInline(admin.StackedInline):
    model = StaffProfile
    can_delete = False
    max_num = 1
    min_num = 0


class UserAdmin(BaseUserAdmin):
    inlines = (StaffProfileInline,)


admin.site.unregister(User)
admin.site.register(User, UserAdmin)


@admin.register(StaffProfile)
class StaffProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role")
    list_filter = ("role",)
    search_fields = ("user__email", "user__username")


@admin.register(PortalNotification)
class PortalNotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "category", "read_at", "created_at")
    list_filter = ("category", "read_at")
    search_fields = ("title", "message", "user__email")
    readonly_fields = ("created_at",)
