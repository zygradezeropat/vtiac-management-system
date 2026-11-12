import sys
import os
import secrets
from datetime import date

# Add project root to sys.path
sys.path.insert(0, os.path.abspath("vtiac-system"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
import django
django.setup()

from django.utils import timezone
from django.contrib.auth.models import User
from backend.student.models import (
    StudentRegistration,
    StudentEnrollmentProfile,
    StudentEnrollmentDocument,
)

students_to_add = [
    # 1. Automotive Servicing NC I
    {
        "first_name": "Juan",
        "middle_name": "Reyes",
        "last_name": "Dela Cruz",
        "email": "juan.delacruz@vtiac.local",
        "phone": "09171234567",
        "program": "Automotive Servicing NC I",
        "preferred_schedule": "mon_fri_8_5",
        "gender": "male",
        "birth_date": date(2000, 5, 15),
    },
    {
        "first_name": "Maria",
        "middle_name": "Clara",
        "last_name": "Santos",
        "email": "maria.santos@vtiac.local",
        "phone": "09181234568",
        "program": "Automotive Servicing NC I",
        "preferred_schedule": "mon_fri_8_5",
        "gender": "female",
        "birth_date": date(2001, 8, 20),
    },
    # 2. Driving NC II
    {
        "first_name": "Dave",
        "middle_name": "Patrick",
        "last_name": "Patana",
        "email": "patana.dave@vtiac.local",
        "phone": "09191234569",
        "program": "Driving NC II",
        "preferred_schedule": "mon_fri_8_5",
        "gender": "male",
        "birth_date": date(1999, 3, 10),
    },
    {
        "first_name": "Ana",
        "middle_name": "Marie",
        "last_name": "Reyes",
        "email": "ana.reyes@vtiac.local",
        "phone": "09201234570",
        "program": "Driving NC II",
        "preferred_schedule": "mon_fri_8_5",
        "gender": "female",
        "birth_date": date(2002, 1, 25),
    },
    {
        "first_name": "Mark",
        "middle_name": "Anthony",
        "last_name": "Lim",
        "email": "mark.lim@vtiac.local",
        "phone": "09211234571",
        "program": "Driving NC II",
        "preferred_schedule": "mon_fri_8_5",
        "gender": "male",
        "birth_date": date(2000, 11, 5),
    },
    # 3. Automotive Servicing (Engine Repair) NC II
    {
        "first_name": "Christian",
        "middle_name": "Paul",
        "last_name": "Gonzales",
        "email": "christian.gonzales@vtiac.local",
        "phone": "09221234572",
        "program": "Automotive Servicing (Engine Repair) NC II",
        "preferred_schedule": "mon_fri_8_5",
        "gender": "male",
        "birth_date": date(2001, 4, 12),
    },
    {
        "first_name": "Joshua",
        "middle_name": "Manuel",
        "last_name": "Castro",
        "email": "joshua.castro@vtiac.local",
        "phone": "09231234573",
        "program": "Automotive Servicing (Engine Repair) NC II",
        "preferred_schedule": "mon_fri_8_5",
        "gender": "male",
        "birth_date": date(2000, 9, 18),
    },
    {
        "first_name": "Gabriel",
        "middle_name": "John",
        "last_name": "Bautista",
        "email": "gabriel.bautista@vtiac.local",
        "phone": "09241234574",
        "program": "Automotive Servicing (Engine Repair) NC II",
        "preferred_schedule": "mon_fri_8_5",
        "gender": "male",
        "birth_date": date(1999, 12, 3),
    },
    # 4. Driving NC III (Passenger Bus / Straight Truck)
    {
        "first_name": "Michael",
        "middle_name": "Angelo",
        "last_name": "Ramos",
        "email": "michael.ramos@vtiac.local",
        "phone": "09251234575",
        "program": "Driving NC III (Passenger Bus / Straight Truck)",
        "preferred_schedule": "mon_fri_8_5",
        "gender": "male",
        "birth_date": date(1998, 7, 22),
    },
    {
        "first_name": "Jerome",
        "middle_name": "Vincent",
        "last_name": "Garcia",
        "email": "jerome.garcia@vtiac.local",
        "phone": "09261234576",
        "program": "Driving NC III (Passenger Bus / Straight Truck)",
        "preferred_schedule": "mon_fri_8_5",
        "gender": "male",
        "birth_date": date(1997, 2, 14),
    },
    {
        "first_name": "Richard",
        "middle_name": "Ryan",
        "last_name": "Mendoza",
        "email": "richard.mendoza@vtiac.local",
        "phone": "09271234577",
        "program": "Driving NC III (Passenger Bus / Straight Truck)",
        "preferred_schedule": "mon_fri_8_5",
        "gender": "male",
        "birth_date": date(1999, 8, 30),
    },
    # 5. Rice Machinery Operations NC II
    {
        "first_name": "Arnel",
        "middle_name": "Francisco",
        "last_name": "Torres",
        "email": "arnel.torres@vtiac.local",
        "phone": "09281234578",
        "program": "Rice Machinery Operations NC II",
        "preferred_schedule": "mon_fri_8_5",
        "gender": "male",
        "birth_date": date(2000, 6, 8),
    },
    {
        "first_name": "Dominic",
        "middle_name": "Angelo",
        "last_name": "Flores",
        "email": "dominic.flores@vtiac.local",
        "phone": "09291234579",
        "program": "Rice Machinery Operations NC II",
        "preferred_schedule": "mon_fri_8_5",
        "gender": "male",
        "birth_date": date(2001, 10, 19),
    },
    {
        "first_name": "Leo",
        "middle_name": "Joseph",
        "last_name": "Villanueva",
        "email": "leo.villanueva@vtiac.local",
        "phone": "09301234580",
        "program": "Rice Machinery Operations NC II",
        "preferred_schedule": "mon_fri_8_5",
        "gender": "male",
        "birth_date": date(2002, 3, 27),
    },
]

now = timezone.now()
doc_types = ["birth_certificate", "photo_2x2", "transcript", "valid_id"]

for s in students_to_add:
    user, _ = User.objects.get_or_create(
        username=s["email"],
        defaults={
            "email": s["email"],
            "first_name": s["first_name"],
            "last_name": s["last_name"],
            "is_active": True,
        },
    )
    user.set_password("StudentPass123!")
    user.save()

    reg, _ = StudentRegistration.objects.get_or_create(
        email=s["email"],
        defaults={
            "user": user,
            "reference_id": secrets.token_hex(4).upper(),
            "first_name": s["first_name"],
            "middle_name": s["middle_name"],
            "last_name": s["last_name"],
            "phone_number": s["phone"],
            "region_code": "11",
            "province_code": "1123",
            "city_code": "112314",
            "barangay_code": "112314018",
            "street_house": "Purok 1",
            "birth_date": s["birth_date"],
            "gender": s["gender"],
            "civil_status": "single",
            "emergency_name": "Parent Guardian",
            "emergency_phone": "09120000000",
            "program_type": StudentRegistration.ProgramType.TRAINING_WITH_ASSESSMENT,
            "selected_program": s["program"],
            "preferred_schedule": s["preferred_schedule"],
            "status": StudentRegistration.Status.APPROVED,
            "hard_copies_submitted": True,
            "hard_copies_submitted_at": now,
        },
    )
    reg.status = StudentRegistration.Status.APPROVED
    reg.hard_copies_submitted = True
    reg.hard_copies_submitted_at = now
    reg.save()

    prof, _ = StudentEnrollmentProfile.objects.get_or_create(
        registration=reg,
        defaults={
            "user": user,
            "tsmis": reg.reference_id,
            "entry_date": now.date(),
            "first_name": s["first_name"],
            "middle_name": s["middle_name"],
            "last_name": s["last_name"],
            "email": s["email"],
            "contact_number": s["phone"],
            "region_code": "11",
            "province_code": "1123",
            "city_code": "112314",
            "barangay_code": "112314018",
            "street_house": "Purok 1",
            "nationality": "Filipino",
            "sex": s["gender"],
            "civil_status": "single",
            "birth_date": s["birth_date"],
            "selected_program": s["program"],
            "program_type": StudentRegistration.ProgramType.TRAINING_WITH_ASSESSMENT,
            "privacy_consent": True,
            "signature": f"{s['first_name']} {s['last_name']}",
            "date_accomplished": now.date(),
            "profile_step_completed": True,
            "requirements_submitted": True,
            "requirements_submitted_at": now,
            "documents_review_released": True,
            "documents_review_released_at": now,
            "hard_copies_submitted": True,
            "hard_copies_submitted_at": now,
            "hard_copy_documents": {
                "valid_id": True,
                "photo_2x2": True,
                "birth_certificate": True,
                "transcript": True,
            },
        },
    )
    prof.profile_step_completed = True
    prof.requirements_submitted = True
    prof.requirements_submitted_at = now
    prof.documents_review_released = True
    prof.documents_review_released_at = now
    prof.hard_copies_submitted = True
    prof.hard_copies_submitted_at = now
    prof.preferred_schedule_id = None
    prof.save()

    for dt in doc_types:
        doc, _ = StudentEnrollmentDocument.objects.get_or_create(
            profile=prof,
            document_type=dt,
            defaults={
                "file": f"sample_docs/{dt}.pdf",
                "registrar_status": "approved",
                "reviewed_at": now,
                "hard_copy_received": True,
                "hard_copy_received_at": now,
            },
        )
        doc.registrar_status = "approved"
        doc.save()

    print(f"Ready: {s['first_name']} {s['last_name']} -> {s['program']}")

print("All sample students processed successfully.")
