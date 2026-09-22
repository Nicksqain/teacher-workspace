-- CreateTable
CREATE TABLE "lessons" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lessons_starts_at_idx" ON "lessons"("starts_at");
