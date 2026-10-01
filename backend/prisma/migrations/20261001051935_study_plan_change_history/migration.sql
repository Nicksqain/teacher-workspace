-- CreateTable
CREATE TABLE "study_plan_changes" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_plan_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_plan_changes_kind_target_id_created_at_idx" ON "study_plan_changes"("kind", "target_id", "created_at");
