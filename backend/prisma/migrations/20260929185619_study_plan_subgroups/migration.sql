-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "assignment_id" TEXT;

-- CreateTable
CREATE TABLE "study_subgroups" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "study_subgroups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,

    CONSTRAINT "teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_plan_assignments" (
    "id" TEXT NOT NULL,
    "study_plan_id" TEXT NOT NULL,
    "subgroup_number" INTEGER NOT NULL DEFAULT 0,
    "subgroup_id" TEXT,
    "teacher_id" TEXT,
    "teacher_label" TEXT NOT NULL,
    "total_hours" INTEGER NOT NULL,

    CONSTRAINT "study_plan_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "study_subgroups_group_id_number_key" ON "study_subgroups"("group_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "study_plan_assignments_study_plan_id_subgroup_number_key" ON "study_plan_assignments"("study_plan_id", "subgroup_number");

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "study_plan_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_subgroups" ADD CONSTRAINT "study_subgroups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "study_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plan_assignments" ADD CONSTRAINT "study_plan_assignments_study_plan_id_fkey" FOREIGN KEY ("study_plan_id") REFERENCES "study_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plan_assignments" ADD CONSTRAINT "study_plan_assignments_subgroup_id_fkey" FOREIGN KEY ("subgroup_id") REFERENCES "study_subgroups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plan_assignments" ADD CONSTRAINT "study_plan_assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
