from datetime import date
from django.test import TestCase, RequestFactory
from django.contrib.auth.models import User
from backend.registrar.models import RegistrarScheduleTemplate, BatchKind
from backend.registrar.batching_api import (
    batching_batches_payload,
    _serialize_batch_card,
    _serialize_template,
)


class RegistrarBatchingTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()

        # 1. Training Batch Template
        self.training_template = RegistrarScheduleTemplate.objects.create(
            course_id="c_driving_nc_iii",
            course_name="Driving NC III (Passenger Bus / Straight Truck)",
            batch_kind=BatchKind.TRAINING.value,
            academic_year="AY 2026–2027",
            term="1st Semester",
            name="Batch 1",
            batch_label="AY 2026–2027 · Batch 1",
            schedule_type="weekdays",
            days=["mon", "tue", "wed", "thu", "fri"],
            time_from="08:00",
            time_to="12:00",
            daily_hours=4.0,
            available_from=date(2026, 11, 16),
            available_until=date(2026, 12, 17),
            trainer_name="Driving NC III Trainer",
            status="draft",
        )

        # 2. National Assessment Batch Template
        self.assessment_template = RegistrarScheduleTemplate.objects.create(
            course_id="c_driving_nc_iii_nat",
            course_name="Driving NC III (Passenger Bus / Straight Truck)",
            batch_kind=BatchKind.NATIONAL_ASSESSMENT.value,
            academic_year="AY 2026–2027",
            term="1st Semester",
            name="Batch 1",
            batch_label="AY 2026–2027 · Batch 1",
            schedule_type="custom",
            days=["mon"],
            time_from="08:00",
            time_to="12:00",
            daily_hours=4.0,
            available_from=date(2026, 11, 19),
            available_until=date(2026, 11, 19),
            trainer_name="TESDA Accredited Assessor",
            examiner_name="TESDA Accredited Assessor",
            examination_course="VTIAC Assessment Center Room 101",
            status="draft",
        )

    def test_batching_batches_payload_separates_training_and_assessment(self):
        payload = batching_batches_payload()
        self.assertEqual(len(payload), 2)

        # Check that both batches are serialized with their batchKind and category
        training_card = next(
            (b for b in payload if b["id"] == f"tmpl-{self.training_template.pk}"), None
        )
        self.assertIsNotNone(training_card)
        self.assertEqual(training_card["batchKind"], "training")
        self.assertEqual(training_card["category"], "institutional")
        self.assertEqual(training_card["trainer"], "Driving NC III Trainer")

        assessment_card = next(
            (b for b in payload if b["id"] == f"tmpl-{self.assessment_template.pk}"), None
        )
        self.assertIsNotNone(assessment_card)
        self.assertEqual(assessment_card["batchKind"], "national_assessment")
        self.assertEqual(assessment_card["category"], "national")
        self.assertEqual(assessment_card["examinerName"], "TESDA Accredited Assessor")
        self.assertEqual(
            assessment_card["assessmentVenue"], "VTIAC Assessment Center Room 101"
        )

    def test_same_batch_name_allowed_across_different_batch_kinds(self):
        """
        Verify that a Training batch named 'Batch 1' and a National Assessment batch
        named 'Batch 1' for the same course can coexist without conflict.
        """
        training_batches = RegistrarScheduleTemplate.objects.filter(
            course_name=self.training_template.course_name,
            batch_kind=BatchKind.TRAINING.value,
            name="Batch 1",
        )
        assessment_batches = RegistrarScheduleTemplate.objects.filter(
            course_name=self.assessment_template.course_name,
            batch_kind=BatchKind.NATIONAL_ASSESSMENT.value,
            name="Batch 1",
        )
        self.assertEqual(training_batches.count(), 1)
        self.assertEqual(assessment_batches.count(), 1)
