-- CreateTable
CREATE TABLE "study_plan_annual_hours" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "academic_year" TEXT NOT NULL,
    "subgroup_number" INTEGER NOT NULL DEFAULT 0,
    "teacher_label" TEXT NOT NULL,
    "exam_hours" INTEGER NOT NULL DEFAULT 0,
    "consultation_hours" INTEGER NOT NULL DEFAULT 0,
    "project_hours" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "study_plan_annual_hours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "study_plan_annual_hours_group_id_subject_id_academic_year_s_key" ON "study_plan_annual_hours"("group_id", "subject_id", "academic_year", "subgroup_number");

-- AddForeignKey
ALTER TABLE "study_plan_annual_hours" ADD CONSTRAINT "study_plan_annual_hours_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "study_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plan_annual_hours" ADD CONSTRAINT "study_plan_annual_hours_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
