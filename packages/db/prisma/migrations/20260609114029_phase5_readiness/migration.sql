-- CreateEnum
CREATE TYPE "ReadinessDecision" AS ENUM ('rest', 'easy', 'normal', 'hard');

-- CreateTable
CREATE TABLE "readiness_metrics" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "readiness_score" INTEGER NOT NULL,
    "hrv_vs_baseline" DOUBLE PRECISION,
    "rhr_vs_baseline" DOUBLE PRECISION,
    "sleep_factor" DOUBLE PRECISION,
    "load_signal" DOUBLE PRECISION,
    "decision" "ReadinessDecision" NOT NULL,
    "rationale" JSONB NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "engine_version" TEXT NOT NULL,

    CONSTRAINT "readiness_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "readiness_metrics_user_id_date_idx" ON "readiness_metrics"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "readiness_metrics_user_id_date_key" ON "readiness_metrics"("user_id", "date");

-- AddForeignKey
ALTER TABLE "readiness_metrics" ADD CONSTRAINT "readiness_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
