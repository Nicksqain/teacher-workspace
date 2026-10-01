BEGIN;
ALTER TABLE "study_plan_assignments" ADD COLUMN "part_number" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "study_plan_annual_hours" ADD COLUMN "part_number" INTEGER NOT NULL DEFAULT 0;
DROP INDEX "study_plan_assignments_study_plan_id_subgroup_number_key";
DROP INDEX "study_plan_annual_hours_group_id_subject_id_academic_year_s_key";

UPDATE "study_plan_assignments" a
SET "part_number" = GREATEST(a."subgroup_number", 1), "subgroup_number" = 0, "subgroup_id" = NULL
FROM "study_plans" p JOIN "subjects" s ON s.id = p.subject_id
WHERE a.study_plan_id = p.id AND lower(trim(s.name)) IN ('нвтп', 'начальная военная и технологическая подготовка');

UPDATE "study_plan_annual_hours" a
SET "part_number" = GREATEST(a."subgroup_number", 1), "subgroup_number" = 0
FROM "subjects" s
WHERE a.subject_id = s.id AND lower(trim(s.name)) IN ('нвтп', 'начальная военная и технологическая подготовка');

CREATE UNIQUE INDEX "plan_assignment_subgroup_part_key" ON "study_plan_assignments"("study_plan_id", "subgroup_number", "part_number");
CREATE UNIQUE INDEX "annual_hours_group_subject_year_subgroup_part_key" ON "study_plan_annual_hours"("group_id", "subject_id", "academic_year", "subgroup_number", "part_number");
COMMIT;
