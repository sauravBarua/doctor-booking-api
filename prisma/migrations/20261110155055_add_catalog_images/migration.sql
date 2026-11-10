-- AlterTable
ALTER TABLE "clinics" ADD COLUMN     "image_public_id" TEXT,
ADD COLUMN     "image_url" TEXT;

-- AlterTable
ALTER TABLE "specialties" ADD COLUMN     "icon_public_id" TEXT,
ADD COLUMN     "icon_url" TEXT;
