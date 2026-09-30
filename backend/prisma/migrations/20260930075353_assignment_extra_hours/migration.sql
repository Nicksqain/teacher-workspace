-- AlterTable
ALTER TABLE "study_plan_assignments" ADD COLUMN     "consultation_hours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "exam_hours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "project_hours" INTEGER NOT NULL DEFAULT 0;
