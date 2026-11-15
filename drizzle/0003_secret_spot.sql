ALTER TABLE "sessions" ADD COLUMN "token_mints" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "debrief_attempts" integer DEFAULT 0 NOT NULL;