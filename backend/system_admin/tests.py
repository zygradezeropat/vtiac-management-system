from django.test import TestCase
from backend.system_admin.models import NcProgram, ProgramCompetency
from backend.system_admin.programs import (
    create_program,
    save_program_competencies,
    list_program_competencies,
    get_competency_library,
)
from backend.trainer.grading_sample import (
    record_sheet_structure_for_program,
    unit_competencies_for_program,
    non_encodable_structure_for_program,
)


class DynamicProgramCompetencyTests(TestCase):
    def setUp(self):
        self.program = NcProgram.objects.create(
            name="Welding NC II",
            training_fee=5000.00,
            sort_order=1,
            is_active=True,
        )

    def test_save_and_list_program_competencies(self):
        competencies_data = [
            {
                "category": "basic",
                "code": "500311105",
                "title": "Participate in workplace communication",
                "nominal_hours": 4,
                "sort_order": 1,
                "learning_outcomes": ["Obtain and convey workplace information", "Complete relevant work related documents"],
            },
            {
                "category": "common",
                "code": "MEE721201",
                "title": "Apply safety practices",
                "nominal_hours": 10,
                "sort_order": 2,
                "learning_outcomes": ["Identify hazardous area", "Use protective clothing and devices"],
            },
            {
                "category": "core",
                "code": "MEE721301",
                "title": "Weld carbon steel plates using SMAW",
                "nominal_hours": 80,
                "sort_order": 3,
                "learning_outcomes": ["Perform groove weld on carbon steel plate in 1G position"],
            },
        ]

        saved = save_program_competencies(self.program.pk, competencies_data)
        self.assertEqual(len(saved), 3)

        comps = list_program_competencies(self.program.pk)
        self.assertEqual(len(comps), 3)
        self.assertEqual(comps[0]["category"], "basic")
        self.assertEqual(comps[1]["category"], "common")
        self.assertEqual(comps[2]["category"], "core")
        self.assertEqual(comps[2]["code"], "MEE721301")
        self.assertEqual(len(comps[2]["learningOutcomes"]), 1)

    def test_dynamic_trainer_sheets_reflect_custom_program(self):
        competencies_data = [
            {
                "category": "basic",
                "code": "B1",
                "title": "Basic Unit 1",
                "nominal_hours": 5,
                "learning_outcomes": ["LO 1", "LO 2"],
            },
            {
                "category": "common",
                "code": "C1",
                "title": "Common Unit 1",
                "nominal_hours": 10,
                "learning_outcomes": ["LO A"],
            },
            {
                "category": "core",
                "code": "CR1",
                "title": "Core Unit 1",
                "nominal_hours": 40,
                "learning_outcomes": ["LO Core 1", "LO Core 2"],
            },
        ]
        save_program_competencies(self.program.pk, competencies_data)

        # Test trainer record sheet structure dynamically reflects all 3 categories
        struct = record_sheet_structure_for_program("Welding NC II")
        self.assertEqual(len(struct), 3)
        self.assertEqual(struct[0]["label"], "BASIC COMPETENCIES")
        self.assertEqual(struct[1]["label"], "COMMON COMPETENCIES")
        self.assertEqual(struct[2]["label"], "CORE COMPETENCIES")
        self.assertEqual(struct[2]["units"][0]["title"], "Core Unit 1")

        # Test unit competencies for grading
        grading_units = unit_competencies_for_program("Welding NC II")
        self.assertEqual(len(grading_units), 3)

        # Test Sheet 3 non-encodable overall results structure
        non_encodable = non_encodable_structure_for_program("Welding NC II")
        self.assertEqual(len(non_encodable), 3)

    def test_competency_library(self):
        library = get_competency_library()
        self.assertIn("basic", library)
        self.assertIn("common", library)
        self.assertIn("core", library)
        self.assertTrue(len(library["basic"]) >= 4)
        self.assertTrue(len(library["common"]) >= 3)

    def test_create_program_auto_seeds_basic_and_common(self):
        created = create_program(
            name="Bread and Pastry Production NC II",
            training_fee=6500.00,
        )
        program_id = created["id"]
        comps = list_program_competencies(program_id)
        # Should have seeded standard Basic (4) and Common (3) competencies automatically
        self.assertGreaterEqual(len(comps), 7)
        basic_count = sum(1 for c in comps if c["category"] == "basic")
        common_count = sum(1 for c in comps if c["category"] == "common")
        self.assertEqual(basic_count, 4)
        self.assertEqual(common_count, 3)

    def test_program_creation_with_explicit_competencies_and_trainer_correspondence(self):
        from backend.trainer.services import PROGRAM_QUALIFICATIONS, get_active_program_qualifications
        from backend.system_admin.user_management import update_user, create_trainer_staff_user, serialize_user
        from django.contrib.auth.models import User

        new_prog = create_program(
            name="Solar PV Installation NC II",
            training_fee=12000.00,
            competencies=[
                {
                    "category": "basic",
                    "code": "BASIC-01",
                    "title": "Participate in workplace communication",
                    "nominal_hours": 4,
                },
                {
                    "category": "common",
                    "code": "COM-01",
                    "title": "Apply Quality Standards",
                    "nominal_hours": 8,
                },
                {
                    "category": "core",
                    "code": "SOLAR-CORE-01",
                    "title": "Install solar photovoltaic modules",
                    "nominal_hours": 60,
                    "learning_outcomes": ["Mount solar frames", "Connect PV wiring"],
                },
            ],
        )

        # 1. Registered program must immediately be available in trainer qualifications
        active_quals = list(PROGRAM_QUALIFICATIONS)
        self.assertIn("Solar PV Installation NC II", active_quals)
        self.assertIn("Solar PV Installation NC II", get_active_program_qualifications())

        # 2. Competencies must be stored
        prog_comps = list_program_competencies(new_prog["id"])
        self.assertEqual(len(prog_comps), 3)
        self.assertEqual(prog_comps[2]["code"], "SOLAR-CORE-01")
        self.assertEqual(prog_comps[2]["learningOutcomes"], ["Mount solar frames", "Connect PV wiring"])

        # 3. Dynamic trainer record sheets must immediately reflect the new program and units
        sheet = record_sheet_structure_for_program("Solar PV Installation NC II")
        self.assertEqual(len(sheet), 3)
        self.assertEqual(sheet[2]["label"], "CORE COMPETENCIES")
        self.assertEqual(sheet[2]["units"][0]["title"], "Install solar photovoltaic modules")

        # 4. Trainer can be assigned this newly registered program
        trainer_dict = create_trainer_staff_user({
            "first_name": "Juan",
            "last_name": "Trainer",
            "email": "juantrainer@example.com",
            "phone_number": "09171234567",
            "password": "Password123!",
            "password_confirm": "Password123!",
            "highest_tesda_nc": "NC II Assessor",
            "qualifications": ["Solar PV Installation NC II"],
            "years_experience": "4_6",
        })
        self.assertIn("Solar PV Installation NC II", trainer_dict.get("qualifications", []))

        # 5. Admin updates trainer qualifications to add another registered program
        updated = update_user(
            trainer_dict["id"],
            qualifications=["Solar PV Installation NC II", "Welding NC II"],
        )
        self.assertIn("Solar PV Installation NC II", updated.get("qualifications", []))
        self.assertIn("Welding NC II", updated.get("qualifications", []))

