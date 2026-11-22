import os
import sys
import secrets
from datetime import date
from decimal import Decimal

# Ensure python path is set
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
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
from backend.cashier.models import CashierPayment
from backend.student.assessment_enrollment import default_assessment_application_data
from backend.registrar.batching_student_pool import available_students_for_course

now = timezone.now()
COURSE = "Automotive Servicing (Engine Repair) NC II"

CANDIDATES = [
    {
        "first_name": "Michael",
        "middle_name": "James",
        "last_name": "Reyes",
        "email": "michael.reyes@vtiac.local",
        "phone": "09171234501",
        "preferred_schedule": "Mondays - Fridays (8am - 5pm)",
        "gender": "male",
        "birth_date": date(2001, 5, 14),
        "street": "Purok 2, San Miguel",
        "company": "Reyes Auto Care",
        "position": "Junior Mechanic",
        "mother_name": "Elena M. Reyes",
        "father_name": "Roberto S. Reyes",
    },
    {
        "first_name": "Angela",
        "middle_name": "Christine",
        "last_name": "Bautista",
        "email": "angela.bautista@vtiac.local",
        "phone": "09171234502",
        "preferred_schedule": "Mondays - Fridays (8am - 5pm)",
        "gender": "female",
        "birth_date": date(2002, 9, 21),
        "street": "Block 5, Greenhills",
        "company": "Panabo Motor Works",
        "position": "Engine Assistant",
        "mother_name": "Carmela C. Bautista",
        "father_name": "Danilo T. Bautista",
    },
    {
        "first_name": "Christian",
        "middle_name": "Mark",
        "last_name": "Santos",
        "email": "christian.santos@vtiac.local",
        "phone": "09171234503",
        "preferred_schedule": "Saturdays - Sundays (8am - 5pm)",
        "gender": "male",
        "birth_date": date(2000, 12, 3),
        "street": "Zone 4, Poblacion",
        "company": "Santos Garage",
        "position": "Apprentice Technician",
        "mother_name": "Teresa M. Santos",
        "father_name": "Ferdinand G. Santos",
    },
]

created_list = []

for c in CANDIDATES:
    # 1. User account
    username = c["email"].split("@")[0]
    user, _ = User.objects.get_or_create(
        username=username,
        defaults={
            "first_name": c["first_name"],
            "last_name": c["last_name"],
            "email": c["email"],
            "is_active": True,
        },
    )
    user.set_password("Student@123")
    user.save()

    # 2. StudentRegistration
    ref_id = secrets.token_hex(4).upper()
    reg, _ = StudentRegistration.objects.get_or_create(
        email=c["email"],
        selected_program=COURSE,
        defaults={
            "user": user,
            "reference_id": ref_id,
            "first_name": c["first_name"],
            "middle_name": c["middle_name"],
            "last_name": c["last_name"],
            "phone_number": c["phone"],
            "birth_date": c["birth_date"],
            "gender": c["gender"],
            "street_house": c["street"],
            "civil_status": "single",
            "program_type": StudentRegistration.ProgramType.ASSESSMENT_ONLY,
            "preferred_schedule": c["preferred_schedule"],
            "status": StudentRegistration.Status.APPROVED,
        },
    )
    reg.status = StudentRegistration.Status.APPROVED
    reg.program_type = StudentRegistration.ProgramType.ASSESSMENT_ONLY
    reg.preferred_schedule = c["preferred_schedule"]
    reg.birth_date = c["birth_date"]
    reg.gender = c["gender"]
    reg.street_house = c["street"]
    reg.civil_status = "single"
    reg.user = user
    reg.save()

    # 3. Assessment Application Data payload
    app_data = default_assessment_application_data()
    app_data["school_name"] = "Valiant Technical Institute and Assessment Center, Inc."
    app_data["school_address"] = "Bangoy St., Salvacion, Panabo, Philippines, 8105"
    app_data["assessment_title"] = COURSE
    app_data["assessment_types"] = ["full_qualification"]
    app_data["client_types"] = ["industry_worker"]
    app_data["mother_name"] = c["mother_name"]
    app_data["father_name"] = c["father_name"]
    app_data["zip_code"] = "8105"
    app_data["age"] = str(date.today().year - c["birth_date"].year)
    app_data["work_experience"] = [
        {
            "company": c["company"],
            "position": c["position"],
            "inclusive_dates": "2023 - 2026",
            "monthly_salary": "18000",
            "appointment_status": "Regular",
            "years_experience": "3",
        }
    ]

    # 4. StudentEnrollmentProfile
    prof, _ = StudentEnrollmentProfile.objects.get_or_create(
        registration=reg,
        defaults={
            "user": user,
            "entry_date": now.date(),
            "first_name": c["first_name"],
            "middle_name": c["middle_name"],
            "last_name": c["last_name"],
            "email": c["email"],
            "contact_number": c["phone"],
            "selected_program": COURSE,
            "program_type": StudentRegistration.ProgramType.ASSESSMENT_ONLY,
            "sex": c["gender"],
            "civil_status": "single",
            "birth_date": c["birth_date"],
            "nationality": "Filipino",
            "street_house": c["street"],
            "region_code": "11",
            "province_code": "1123",
            "city_code": "112314",
            "barangay_code": "112314018",
            "privacy_consent": True,
            "signature": f"{c['first_name']} {c['last_name']}",
            "date_accomplished": now.date(),
            "profile_step_completed": True,
            "requirements_submitted": True,
            "requirements_submitted_at": now,
            "documents_review_released": True,
            "documents_review_released_at": now,
            "hard_copies_submitted": True,
            "hard_copies_submitted_at": now,
            "assessment_application_data": app_data,
        },
    )
    prof.selected_program = COURSE
    prof.program_type = StudentRegistration.ProgramType.ASSESSMENT_ONLY
    prof.profile_step_completed = True
    prof.requirements_submitted = True
    prof.requirements_submitted_at = now
    prof.documents_review_released = True
    prof.documents_review_released_at = now
    prof.hard_copies_submitted = True
    prof.hard_copies_submitted_at = now
    prof.preferred_schedule_id = None
    prof.assessment_application_data = app_data
    prof.save()

    # 5. Documents
    for dt in ["birth_certificate", "valid_id", "covid_completion_certificate"]:
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
        doc.hard_copy_received = True
        doc.save()

    # 6. CashierPayment
    total_fee = Decimal("1800.00")
    ctrl_no = f"CN-{secrets.token_hex(3).upper()}"
    or_no = f"OR-{secrets.token_hex(3).upper()}"
    particulars = [
        {"amount": 500.0, "description": "Registration Fee"},
        {"amount": 1300.0, "description": COURSE},
    ]

    pmt, _ = CashierPayment.objects.get_or_create(
        registration=reg,
        defaults={
            "profile": prof,
            "control_number": ctrl_no,
            "or_number": or_no,
            "student_name": f"{c['first_name']} {c['last_name']}",
            "total_payable": total_fee,
            "paid_amount": total_fee,
            "remaining_balance": Decimal("0.00"),
            "particulars": particulars,
            "status": CashierPayment.Status.FULL,
            "receipt_type": CashierPayment.ReceiptType.INVOICE,
        },
    )
    pmt.profile = prof
    pmt.total_payable = total_fee
    pmt.paid_amount = total_fee
    pmt.remaining_balance = Decimal("0.00")
    pmt.particulars = particulars
    pmt.status = CashierPayment.Status.FULL
    pmt.receipt_type = CashierPayment.ReceiptType.INVOICE
    pmt.save()

    created_list.append(f"{c['first_name']} {c['last_name']} ({c['preferred_schedule']})")

print(f"Successfully seeded {len(created_list)} Assessment-Only candidates:")
for item in created_list:
    print(f"  * {item}")

avail = available_students_for_course(COURSE, batch_kind="national_assessment")
print(f"\nTotal ready for National Assessment Batching in '{COURSE}': {len(avail)} candidates")
for s in avail:
    print(f"  -> {s['fullName']} | Pref: {s['preferredSchedule']}")
