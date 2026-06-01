"""Cashier-recorded payments linked to student enrollment profiles."""

from django.conf import settings
from django.db import models


class CashierPayment(models.Model):
    class ReceiptType(models.TextChoices):
        INVOICE = "OR", "Invoice"
        AR = "AR", "Acknowledgement Receipt"

    class Status(models.TextChoices):
        UNPAID = "Unpaid", "Unpaid"
        PARTIAL = "Partial Payment", "Partial Payment"
        FULL = "Full Payment", "Full Payment"

    profile = models.ForeignKey(
        "student.StudentEnrollmentProfile",
        on_delete=models.CASCADE,
        related_name="cashier_payments",
    )
    registration = models.ForeignKey(
        "student.StudentRegistration",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cashier_payments",
    )
    control_number = models.CharField(max_length=32, db_index=True)
    or_number = models.CharField(max_length=64, blank=True)
    receipt_type = models.CharField(max_length=8, choices=ReceiptType.choices, default=ReceiptType.INVOICE)
    student_name = models.CharField(max_length=255)
    particulars = models.JSONField(default=list)
    total_payable = models.DecimalField(max_digits=12, decimal_places=2)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    remaining_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.UNPAID)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cashier_payments_recorded",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "cashier_payment"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["control_number"],
                name="cashier_payment_control_number_unique",
            )
        ]

    def __str__(self):
        return f"{self.control_number} — {self.student_name}"
