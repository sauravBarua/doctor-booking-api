-- CreateTable
CREATE TABLE "availability_rules" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_off" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_minute" INTEGER,
    "end_minute" INTEGER,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_off_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "availability_rules_doctor_id_day_of_week_idx" ON "availability_rules"("doctor_id", "day_of_week");

-- CreateIndex
CREATE INDEX "time_off_doctor_id_date_idx" ON "time_off"("doctor_id", "date");

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written constraints (not expressible in Prisma schema)
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "availability_rules"
  ADD CONSTRAINT "availability_rules_day_valid" CHECK ("day_of_week" BETWEEN 1 AND 7),
  ADD CONSTRAINT "availability_rules_minutes_valid"
    CHECK ("start_minute" >= 0 AND "start_minute" < "end_minute" AND "end_minute" <= 1440),
  ADD CONSTRAINT "availability_rules_no_overlap"
    EXCLUDE USING gist (
      "doctor_id" WITH =,
      "day_of_week" WITH =,
      int4range("start_minute", "end_minute") WITH &&
    );

ALTER TABLE "time_off"
  ADD CONSTRAINT "time_off_minutes_valid" CHECK (
    ("start_minute" IS NULL AND "end_minute" IS NULL)
    OR (
      "start_minute" IS NOT NULL AND "end_minute" IS NOT NULL
      AND "start_minute" >= 0 AND "start_minute" < "end_minute" AND "end_minute" <= 1440
    )
  );
