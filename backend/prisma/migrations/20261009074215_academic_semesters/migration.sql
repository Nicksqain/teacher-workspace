-- CreateTable
CREATE TABLE "academic_semester" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "academic_year" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "starts_on" TEXT NOT NULL,
    "ends_on" TEXT NOT NULL,
    "studyPlanId" TEXT,

    CONSTRAINT "academic_semester_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "academic_semester_group_id_academic_year_number_key" ON "academic_semester"("group_id", "academic_year", "number");

-- AddForeignKey
ALTER TABLE "academic_semester" ADD CONSTRAINT "academic_semester_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_semester" ADD CONSTRAINT "academic_semester_studyPlanId_fkey" FOREIGN KEY ("studyPlanId") REFERENCES "study_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
