"""lecture assignments: one lecture can be given to many classes

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-23 10:00:00
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assignments",
        sa.Column("lecture_id", sa.Integer(), sa.ForeignKey("lectures.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("class_id", sa.Integer(), sa.ForeignKey("classes.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(op.f("ix_assignments_class_id"), "assignments", ["class_id"])
    # published lectures stay visible in their own class
    op.execute(
        "INSERT INTO assignments (lecture_id, class_id, assigned_at) "
        "SELECT id, class_id, created_at FROM lectures WHERE published"
    )
    with op.batch_alter_table("lectures") as batch_op:
        batch_op.drop_column("published")


def downgrade() -> None:
    with op.batch_alter_table("lectures") as batch_op:
        batch_op.add_column(sa.Column("published", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.execute(
        "UPDATE lectures SET published = TRUE "
        "WHERE id IN (SELECT lecture_id FROM assignments WHERE assignments.class_id = lectures.class_id)"
    )
    op.drop_index(op.f("ix_assignments_class_id"), table_name="assignments")
    op.drop_table("assignments")
