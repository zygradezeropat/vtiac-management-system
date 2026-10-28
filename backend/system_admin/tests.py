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
