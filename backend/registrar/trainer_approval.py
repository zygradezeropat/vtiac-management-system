"""Backward-compatible imports for registrar trainer approval."""

from backend.trainer.approval import (
    pending_trainer_requests_count,
    pending_trainer_requests_payload,
    pending_trainer_requests_queryset,
)
from backend.trainer.approval_views import (
    trainer_approval_approve,
    trainer_approval_reject,
)

__all__ = [
    "pending_trainer_requests_count",
    "pending_trainer_requests_payload",
    "pending_trainer_requests_queryset",
    "trainer_approval_approve",
    "trainer_approval_reject",
]
