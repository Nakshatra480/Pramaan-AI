"""research focused on specific documents

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-27 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # "Research with this": the documents a research is built from first. Empty for ordinary research.
    op.add_column(
        "research_sessions",
        sa.Column("focus_document_ids", postgresql.ARRAY(sa.UUID()), server_default="{}", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("research_sessions", "focus_document_ids")
