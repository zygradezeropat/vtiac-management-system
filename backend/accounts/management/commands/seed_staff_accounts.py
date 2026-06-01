from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from backend.core.models import StaffProfile


class Command(BaseCommand):
    help = "Create/update sample staff accounts for each role"

    def handle(self, *args, **options):
        password = "StaffPass123!"
        samples = [
            {
                "username": "registrar",
                "email": "registrar@vtiac.local",
                "first_name": "Registrar",
                "last_name": "Staff",
                "role": StaffProfile.Role.REGISTRAR,
            },
            {
                "username": "cashier",
                "email": "cashier@vtiac.local",
                "first_name": "Cashier",
                "last_name": "Staff",
                "role": StaffProfile.Role.CASHIER,
            },
            {
                "username": "trainer",
                "email": "trainer@vtiac.local",
                "first_name": "Trainer",
                "last_name": "Staff",
                "role": StaffProfile.Role.TRAINER,
            },
            {
                "username": "admin",
                "email": "admin@vtiac.local",
                "first_name": "System",
                "last_name": "Admin",
                "role": StaffProfile.Role.ADMIN,
                "is_superuser": True,
            },
        ]

        for sample in samples:
            is_super = sample.get("is_superuser", False)
            user, created = User.objects.get_or_create(
                username=sample["username"],
                defaults={
                    "email": sample["email"],
                    "first_name": sample["first_name"],
                    "last_name": sample["last_name"],
                    "is_staff": True,
                    "is_superuser": is_super,
                },
            )
            user.email = sample["email"]
            user.first_name = sample["first_name"]
            user.last_name = sample["last_name"]
            user.is_staff = True
            user.is_superuser = is_super
            user.set_password(password)
            user.save()

            StaffProfile.objects.update_or_create(user=user, defaults={"role": sample["role"]})

            state = "created" if created else "updated"
            self.stdout.write(self.style.SUCCESS(f"{state}: {sample['email']} ({sample['role']})"))

        self.stdout.write(
            self.style.WARNING("Sample staff password for all roles: StaffPass123!")
        )
