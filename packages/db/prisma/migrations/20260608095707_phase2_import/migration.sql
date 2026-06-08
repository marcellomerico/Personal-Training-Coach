-- CreateTable
CREATE TABLE "raw_imports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_account_id" TEXT,
    "source" "Provider" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "source_external_id" TEXT,
    "payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "processing_error" TEXT,

    CONSTRAINT "raw_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_account_id" TEXT,
    "source" "Provider" NOT NULL,
    "source_external_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT,
    "duration_sec" INTEGER NOT NULL,
    "distance_m" DOUBLE PRECISION,
    "elevation_gain_m" DOUBLE PRECISION,
    "avg_hr" INTEGER,
    "max_hr" INTEGER,
    "avg_power_w" INTEGER,
    "calories" INTEGER,
    "perceived_exertion" INTEGER,
    "training_load" DOUBLE PRECISION,
    "raw_import_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_health_metrics" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_account_id" TEXT,
    "source" "Provider" NOT NULL,
    "date" DATE NOT NULL,
    "resting_hr" INTEGER,
    "hrv" DOUBLE PRECISION,
    "steps" INTEGER,
    "body_battery" INTEGER,
    "stress_avg" INTEGER,
    "weight_kg" DOUBLE PRECISION,
    "extra" JSONB,
    "raw_import_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_health_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sleep_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_account_id" TEXT,
    "source" "Provider" NOT NULL,
    "date" DATE NOT NULL,
    "sleep_start" TIMESTAMP(3),
    "sleep_end" TIMESTAMP(3),
    "total_sleep_sec" INTEGER,
    "deep_sec" INTEGER,
    "light_sec" INTEGER,
    "rem_sec" INTEGER,
    "awake_sec" INTEGER,
    "sleep_score" INTEGER,
    "raw_import_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sleep_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "raw_imports_user_id_entity_type_idx" ON "raw_imports"("user_id", "entity_type");

-- CreateIndex
CREATE INDEX "raw_imports_provider_account_id_idx" ON "raw_imports"("provider_account_id");

-- CreateIndex
CREATE INDEX "activities_user_id_start_time_idx" ON "activities"("user_id", "start_time");

-- CreateIndex
CREATE INDEX "activities_provider_account_id_idx" ON "activities"("provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "activities_user_id_source_source_external_id_key" ON "activities"("user_id", "source", "source_external_id");

-- CreateIndex
CREATE INDEX "daily_health_metrics_user_id_date_idx" ON "daily_health_metrics"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_health_metrics_user_id_date_source_key" ON "daily_health_metrics"("user_id", "date", "source");

-- CreateIndex
CREATE INDEX "sleep_records_user_id_date_idx" ON "sleep_records"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "sleep_records_user_id_date_source_key" ON "sleep_records"("user_id", "date", "source");

-- AddForeignKey
ALTER TABLE "raw_imports" ADD CONSTRAINT "raw_imports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_health_metrics" ADD CONSTRAINT "daily_health_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sleep_records" ADD CONSTRAINT "sleep_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
