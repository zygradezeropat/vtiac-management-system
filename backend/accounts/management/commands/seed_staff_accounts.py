from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from backend.core.models import StaffProfile
from backend.system_admin.models import (
    NcProgram,
    seed_default_programs,
    seed_default_schedules,
)


class Command(BaseCommand):
    help = "Create/update sample staff accounts and default NC programs"

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

        # Seed default 5 NC Programs & Competencies into the database
        seed_default_programs()
        prog_count = NcProgram.objects.filter(is_active=True).count()
        self.stdout.write(self.style.SUCCESS(f"seeded: {prog_count} default NC programs with competencies"))

        # Seed default training schedules
        seed_default_schedules()
        self.stdout.write(self.style.SUCCESS("seeded: default training schedules"))

        # Seed approved trainers for each program (Automotive trainer covers both NC I and NC II)
        from django.contrib.auth.hashers import make_password
        from backend.core.models import StaffAccountProfile
        from backend.trainer.models import TrainerAccountRequest

        trainer_samples = [
            {
                "username": "trainer.automotive",
                "email": "trainer.automotive@vtiac.local",
                "first_name": "Automotive",
                "last_name": "Trainer",
                "phone": "09123456701",
                "reference_id": "TRN-000001",
                "qualifications": [
                    "Automotive Servicing NC I",
                    "Automotive Servicing (Engine Repair) NC II",
                    "Automotive Servicing NC II",
                ],
                "highest_tesda_nc": "Automotive Servicing NC II (NTTC)",
            },
            {
                "username": "trainer.driving2",
                "email": "trainer.driving2@vtiac.local",
                "first_name": "Driving NC II",
                "last_name": "Trainer",
                "phone": "09123456702",
                "reference_id": "TRN-000002",
                "qualifications": [
                    "Driving NC II",
                ],
                "highest_tesda_nc": "Driving NC II (NTTC)",
            },
            {
                "username": "trainer.driving3",
                "email": "trainer.driving3@vtiac.local",
                "first_name": "Driving NC III",
                "last_name": "Trainer",
                "phone": "09123456703",
                "reference_id": "TRN-000003",
                "qualifications": [
                    "Driving NC III (Passenger Bus / Straight Truck)",
                ],
                "highest_tesda_nc": "Driving NC III (NTTC)",
            },
            {
                "username": "trainer.ricemachinery",
                "email": "trainer.ricemachinery@vtiac.local",
                "first_name": "Rice Machinery",
                "last_name": "Trainer",
                "phone": "09123456704",
                "reference_id": "TRN-000004",
                "qualifications": [
                    "Rice Machinery Operations NC II",
                ],
                "highest_tesda_nc": "Rice Machinery Operations NC II (NTTC)",
            },
        ]

        for t in trainer_samples:
            t_user, created = User.objects.get_or_create(
                username=t["username"],
                defaults={
                    "email": t["email"],
                    "first_name": t["first_name"],
                    "last_name": t["last_name"],
                    "is_staff": True,
                },
            )
            t_user.email = t["email"]
            t_user.first_name = t["first_name"]
            t_user.last_name = t["last_name"]
            t_user.is_staff = True
            t_user.set_password(password)
            t_user.save()

            StaffProfile.objects.update_or_create(
                user=t_user, defaults={"role": StaffProfile.Role.TRAINER}
            )
            StaffAccountProfile.objects.update_or_create(
                user=t_user, defaults={"phone_number": t["phone"]}
            )

            req, req_created = TrainerAccountRequest.objects.get_or_create(
                email=t["email"],
                defaults={
                    "reference_id": t["reference_id"],
                    "first_name": t["first_name"],
                    "last_name": t["last_name"],
                    "phone_number": t["phone"],
                    "password_hash": make_password(password),
                    "qualifications": t["qualifications"],
                    "highest_tesda_nc": t["highest_tesda_nc"],
                    "years_experience": TrainerAccountRequest.ExperienceRange.Y4_6,
                    "status": TrainerAccountRequest.Status.APPROVED,
                },
            )
            if not req_created:
                req.status = TrainerAccountRequest.Status.APPROVED
                req.qualifications = t["qualifications"]
                req.first_name = t["first_name"]
                req.last_name = t["last_name"]
                req.save()

            t_state = "created" if created else "updated"
            self.stdout.write(
                self.style.SUCCESS(
                    f"{t_state} trainer: {t['first_name']} {t['last_name']} -> {', '.join(t['qualifications'])}"
                )
            )

        self.stdout.write(
            self.style.WARNING("Sample staff password for all roles: StaffPass123!")
        )
