import sys
import os
import secrets
from datetime import date
from decimal import Decimal

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
    StudentPaymentProof,
)
from backend.cashier.models import CashierPayment
from backend.cashier.fees import fee_lines_for_program

now = timezone.now()
doc_types = ["birth_certificate", "photo_2x2", "transcript", "valid_id"]

# Diverse list of students
# Status: "pending" -> for testing Accept All / Bulk Approve
# Status: "approved" -> for testing multi-course cards selection, preferred schedules auto-grouping, tables
students_data = [
    # --- PENDING ENROLLMENTS (Fully ready for Accept All / Individual Approve) ---
    {
        "first_name": "Bea",
        "middle_name": "Alonzo",
        "last_name": "Soriano",
        "email": "bea.soriano@vtiac.local",
        "phone": "09170010001",
        "program": "Driving NC II",
        "preferred_schedule": "Saturdays - Sundays (8am - 5pm)",
        "status": "pending",
        "gender": "female",
        "birth_date": date(2002, 4, 18),
    },
    {
        "first_name": "Carlos",
        "middle_name": "Iñigo",
        "last_name": "Valdez",
        "email": "carlos.valdez2@vtiac.local",
        "phone": "09170010002",
        "program": "Driving NC II",
        "preferred_schedule": "Mondays - Fridays (8am - 5pm)",
        "status": "pending",
        "gender": "male",
        "birth_date": date(2001, 11, 23),
    },
    {
        "first_name": "Diana",
        "middle_name": "Rose",
        "last_name": "Zubiri",
        "email": "diana.zubiri@vtiac.local",
        "phone": "09170010003",
        "program": "Driving NC II",
        "preferred_schedule": "Mondays - Fridays (5pm - 9pm)",
        "status": "pending",
        "gender": "female",
        "birth_date": date(2000, 2, 14),
    },
    {
        "first_name": "Eduardo",
        "middle_name": "Perez",
        "last_name": "Manalo",
        "email": "eduardo.manalo@vtiac.local",
        "phone": "09170010004",
        "program": "Automotive Servicing (Engine Repair) NC II",
        "preferred_schedule": "Saturdays - Sundays (8am - 5pm)",
        "status": "pending",
        "gender": "male",
        "birth_date": date(1999, 9, 30),
    },
    {
        "first_name": "Fatima",
        "middle_name": "Grace",
        "last_name": "Lim",
        "email": "fatima.lim@vtiac.local",
        "phone": "09170010005",
        "program": "Automotive Servicing (Engine Repair) NC II",
        "preferred_schedule": "Mondays - Fridays (8am - 5pm)",
        "status": "pending",
        "gender": "female",
        "birth_date": date(2002, 8, 12),
    },
    {
        "first_name": "Gerald",
        "middle_name": "Anderson",
        "last_name": "Cruz",
        "email": "gerald.cruz@vtiac.local",
        "phone": "09170010006",
        "program": "Rice Machinery Operations NC II",
        "preferred_schedule": "Mondays - Fridays (8am - 5pm)",
        "status": "pending",
        "gender": "male",
        "birth_date": date(2001, 3, 5),
    },
    {
        "first_name": "Hannah",
        "middle_name": "Mae",
        "last_name": "Quinto",
        "email": "hannah.quinto@vtiac.local",
        "phone": "09170010007",
        "program": "Rice Machinery Operations NC II",
        "preferred_schedule": "Saturdays - Sundays (8am - 5pm)",
        "status": "pending",
        "gender": "female",
        "birth_date": date(2003, 1, 21),
    },
    {
        "first_name": "Ian",
        "middle_name": "Veneracion",
        "last_name": "Tan",
        "email": "ian.tan@vtiac.local",
        "phone": "09170010008",
        "program": "Automotive Servicing NC I",
        "preferred_schedule": "Saturdays - Sundays (8am - 5pm)",
        "status": "pending",
        "gender": "male",
        "birth_date": date(1998, 12, 19),
    },

    # --- APPROVED STUDENTS (To give each program 6-12 students with multiple schedule tracks) ---
    # Driving NC II: Adding 5 approved students
    {
        "first_name": "Jasmine",
        "middle_name": "Curtis",
        "last_name": "Smith",
        "email": "jasmine.smith@vtiac.local",
        "phone": "09180020001",
        "program": "Driving NC II",
        "preferred_schedule": "Saturdays - Sundays (8am - 5pm)",
        "status": "approved",
        "gender": "female",
        "birth_date": date(2001, 7, 7),
    },
    {
        "first_name": "Kevin",
        "middle_name": "Durant",
        "last_name": "Alvarez",
        "email": "kevin.alvarez@vtiac.local",
        "phone": "09180020002",
        "program": "Driving NC II",
        "preferred_schedule": "Saturdays - Sundays (8am - 5pm)",
        "status": "approved",
        "gender": "male",
        "birth_date": date(2000, 5, 14),
    },
    {
        "first_name": "Liza",
        "middle_name": "Hope",
        "last_name": "Soberano",
        "email": "liza.soberano@vtiac.local",
        "phone": "09180020003",
        "program": "Driving NC II",
        "preferred_schedule": "Saturdays - Sundays (8am - 5pm)",
        "status": "approved",
        "gender": "female",
        "birth_date": date(2002, 1, 4),
    },
    {
        "first_name": "Manuel",
        "middle_name": "Luis",
        "last_name": "Quezon",
        "email": "manuel.quezon@vtiac.local",
        "phone": "09180020004",
        "program": "Driving NC II",
        "preferred_schedule": "Mondays - Fridays (5pm - 9pm)",
        "status": "approved",
        "gender": "male",
        "birth_date": date(1997, 8, 19),
    },
    {
        "first_name": "Nadine",
        "middle_name": "Alexis",
        "last_name": "Lustre",
        "email": "nadine.lustre@vtiac.local",
        "phone": "09180020005",
        "program": "Driving NC II",
        "preferred_schedule": "Mondays - Fridays (8am - 5pm)",
        "status": "approved",
        "gender": "female",
        "birth_date": date(2001, 10, 31),
    },

    # Driving NC III (Passenger Bus / Straight Truck): Adding 4 approved students
    {
        "first_name": "Oscar",
        "middle_name": "Rene",
        "last_name": "Villanueva",
        "email": "oscar.villanueva@vtiac.local",
        "phone": "09190030001",
        "program": "Driving NC III (Passenger Bus / Straight Truck)",
        "preferred_schedule": "Saturdays - Sundays (8am - 5pm)",
        "status": "approved",
        "gender": "male",
        "birth_date": date(1996, 4, 11),
    },
    {
        "first_name": "Patricia",
        "middle_name": "Ann",
        "last_name": "Navarro",
        "email": "patricia.navarro@vtiac.local",
        "phone": "09190030002",
        "program": "Driving NC III (Passenger Bus / Straight Truck)",
        "preferred_schedule": "Saturdays - Sundays (8am - 5pm)",
        "status": "approved",
        "gender": "female",
        "birth_date": date(1999, 6, 25),
    },
    {
        "first_name": "Quentin",
        "middle_name": "Jerome",
        "last_name": "Tarantino",
        "email": "quentin.tarantino@vtiac.local",
        "phone": "09190030003",
        "program": "Driving NC III (Passenger Bus / Straight Truck)",
        "preferred_schedule": "Mondays - Fridays (8am - 5pm)",
        "status": "approved",
        "gender": "male",
        "birth_date": date(1995, 3, 27),
    },
    {
        "first_name": "Regine",
        "middle_name": "Velazquez",
        "last_name": "Alcasid",
        "email": "regine.alcasid@vtiac.local",
        "phone": "09190030004",
        "program": "Driving NC III (Passenger Bus / Straight Truck)",
        "preferred_schedule": "Mondays - Fridays (5pm - 9pm)",
        "status": "approved",
        "gender": "female",
        "birth_date": date(1998, 4, 22),
    },

    # Automotive Servicing (Engine Repair) NC II: Adding 4 approved students
    {
        "first_name": "Sam",
        "middle_name": "Lloyd",
        "last_name": "Milby",
        "email": "sam.milby@vtiac.local",
        "phone": "09200040001",
        "program": "Automotive Servicing (Engine Repair) NC II",
        "preferred_schedule": "Saturdays - Sundays (8am - 5pm)",
        "status": "approved",
        "gender": "male",
        "birth_date": date(1999, 5, 23),
    },
    {
        "first_name": "Toni",
        "middle_name": "Celestine",
        "last_name": "Gonzaga",
        "email": "toni.gonzaga@vtiac.local",
        "phone": "09200040002",
        "program": "Automotive Servicing (Engine Repair) NC II",
        "preferred_schedule": "Saturdays - Sundays (8am - 5pm)",
        "status": "approved",
        "gender": "female",
        "birth_date": date(2000, 1, 20),
    },
    {
        "first_name": "Ulysses",
        "middle_name": "Grant",
        "last_name": "Pascual",
        "email": "ulysses.pascual@vtiac.local",
        "phone": "09200040003",
        "program": "Automotive Servicing (Engine Repair) NC II",
        "preferred_schedule": "Mondays - Fridays (8am - 5pm)",
        "status": "approved",
        "gender": "male",
        "birth_date": date(2001, 9, 15),
    },
    {
        "first_name": "Vanessa",
        "middle_name": "Anne",
        "last_name": "Hudgens",
        "email": "vanessa.hudgens@vtiac.local",
        "phone": "09200040004",
        "program": "Automotive Servicing (Engine Repair) NC II",
        "preferred_schedule": "Mondays - Fridays (5pm - 9pm)",
        "status": "approved",
        "gender": "female",
        "birth_date": date(2002, 12, 14),
    },

    # Rice Machinery Operations NC II: Adding 4 approved students
    {
        "first_name": "Walter",
        "middle_name": "White",
        "last_name": "Hartwell",
        "email": "walter.hartwell@vtiac.local",
        "phone": "09210050001",
        "program": "Rice Machinery Operations NC II",
        "preferred_schedule": "Saturdays - Sundays (8am - 5pm)",
        "status": "approved",
        "gender": "male",
        "birth_date": date(1998, 9, 7),
    },
    {
        "first_name": "Xander",
        "middle_name": "Ford",
        "last_name": "Arizala",
        "email": "xander.arizala@vtiac.local",
        "phone": "09210050002",
        "program": "Rice Machinery Operations NC II",
        "preferred_schedule": "Saturdays - Sundays (8am - 5pm)",
        "status": "approved",
        "gender": "male",
        "birth_date": date(2001, 6, 17),
    },
    {
        "first_name": "Yassi",
        "middle_name": "Isabel",
        "last_name": "Pressman",
        "email": "yassi.pressman@vtiac.local",
        "phone": "09210050003",
        "program": "Rice Machinery Operations NC II",
        "preferred_schedule": "Mondays - Fridays (8am - 5pm)",
        "status": "approved",
        "gender": "female",
        "birth_date": date(2000, 5, 11),
    },
    {
        "first_name": "Zanjoe",
        "middle_name": "Acosta",
        "last_name": "Marudo",
        "email": "zanjoe.marudo@vtiac.local",
        "phone": "09210050004",
        "program": "Rice Machinery Operations NC II",
        "preferred_schedule": "Mondays - Fridays (8am - 5pm)",
        "status": "approved",
        "gender": "male",
        "birth_date": date(1999, 7, 23),
    },
]

created_count = 0
for s in students_data:
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

    target_status = (
        StudentRegistration.Status.APPROVED
        if s["status"] == "approved"
        else StudentRegistration.Status.PENDING
    )

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
            "status": target_status,
            "hard_copies_submitted": True,
            "hard_copies_submitted_at": now,
        },
    )
    reg.status = target_status
    reg.hard_copies_submitted = True
    reg.hard_copies_submitted_at = now
    reg.preferred_schedule = s["preferred_schedule"]
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

    # Documents
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
        doc.hard_copy_received = True
        doc.save()

    # Calculate fee total for program
    lines = fee_lines_for_program(s["program"])
    total_fee = sum(Decimal(str(item.get("amount", 0))) for item in lines) or Decimal("1500.00")

    # Payment Proof
    proof, _ = StudentPaymentProof.objects.get_or_create(
        profile=prof,
        defaults={
            "file": "sample_docs/payment_receipt.pdf",
            "original_filename": "receipt_2026.pdf",
            "reference_note": f"REF-{secrets.token_hex(3).upper()}",
        },
    )

    # Cashier Payment to clear fee balance
    payment, _ = CashierPayment.objects.get_or_create(
        profile=prof,
        defaults={
            "registration": reg,
            "control_number": f"CTRL-{secrets.token_hex(4).upper()}",
            "or_number": f"OR-{secrets.token_hex(3).upper()}",
            "student_name": f"{s['first_name']} {s['last_name']}",
            "total_payable": total_fee,
            "paid_amount": total_fee,
            "remaining_balance": Decimal("0.00"),
            "particulars": lines,
            "status": CashierPayment.Status.FULL,
            "receipt_type": CashierPayment.ReceiptType.INVOICE,
        },
    )
    payment.student_name = f"{s['first_name']} {s['last_name']}"
    payment.total_payable = total_fee
    payment.paid_amount = total_fee
    payment.remaining_balance = Decimal("0.00")
    payment.particulars = lines
    payment.status = CashierPayment.Status.FULL
    payment.save()

    created_count += 1
    print(f"[{s['status'].upper()}] {s['first_name']} {s['last_name']} -> {s['program']} ({s['preferred_schedule']})")

print(f"\nSuccessfully seeded {created_count} students!")
