-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "reason" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_role" "Role",
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_doctor_id_start_at_idx" ON "appointments"("doctor_id", "start_at");

-- CreateIndex
CREATE INDEX "appointments_patient_id_start_at_idx" ON "appointments"("patient_id", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_patient_id_idempotency_key_key" ON "appointments"("patient_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_time_valid" CHECK ("end_at" > "start_at"),
  ADD CONSTRAINT "appointments_no_overlap"
    EXCLUDE USING gist (
      "doctor_id" WITH =,
      tstzrange("start_at", "end_at", '[)') WITH &&
    ) WHERE ("status" = 'CONFIRMED'),
  ADD CONSTRAINT "appointments_patient_no_overlap"
    EXCLUDE USING gist (
      "patient_id" WITH =,
      tstzrange("start_at", "end_at", '[)') WITH &&
    ) WHERE ("status" = 'CONFIRMED');
