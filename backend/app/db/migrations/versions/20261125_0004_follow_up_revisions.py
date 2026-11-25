"""follow-up revisions and answer sources

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-25 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("research_sessions", sa.Column("parent_id", sa.UUID(), nullable=True))
    op.add_column("research_sessions", sa.Column("revision_instructions", sa.Text(), nullable=True))
    op.create_foreign_key("fk_research_sessions_parent_id", "research_sessions", "research_sessions", ["parent_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_research_sessions_parent_id", "research_sessions", ["parent_id"])
    op.add_column("messages", sa.Column("kind", sa.String(length=16), server_default="answer", nullable=False))
    op.add_column("messages", sa.Column("revision_id", sa.UUID(), nullable=True))
    op.add_column("messages", sa.Column("sources", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False))
    op.create_foreign_key("fk_messages_revision_id", "messages", "research_sessions", ["revision_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_messages_revision_id", "messages", ["revision_id"])


def downgrade() -> None:
    op.drop_index("ix_messages_revision_id", table_name="messages")
    op.drop_constraint("fk_messages_revision_id", "messages", type_="foreignkey")
    op.drop_column("messages", "sources")
    op.drop_column("messages", "revision_id")
    op.drop_column("messages", "kind")
    op.drop_index("ix_research_sessions_parent_id", table_name="research_sessions")
    op.drop_constraint("fk_research_sessions_parent_id", "research_sessions", type_="foreignkey")
    op.drop_column("research_sessions", "revision_instructions")
    op.drop_column("research_sessions", "parent_id")
