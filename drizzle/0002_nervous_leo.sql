CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"practice_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"active_practice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "auth_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debrief_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"practice_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"practice_id" uuid,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"can_approve_scenarios" boolean DEFAULT false NOT NULL,
	"user_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitations_kind" CHECK ("invitations"."kind" in ('invite', 'reset')),
	CONSTRAINT "invitations_shape" CHECK (("invitations"."kind" = 'invite' and "invitations"."practice_id" is not null and "invitations"."role" is not null and "invitations"."user_id" is null)
        or ("invitations"."kind" = 'reset' and "invitations"."role" is null and "invitations"."user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"can_approve_scenarios" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deactivated_at" timestamp with time zone,
	CONSTRAINT "memberships_practice_user" UNIQUE("practice_id","user_id"),
	CONSTRAINT "memberships_role" CHECK ("memberships"."role" in ('trainee', 'manager'))
);
--> statement-breakpoint
CREATE TABLE "practice_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"library_scenario_id" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"difficulty" text NOT NULL,
	"persona" jsonb NOT NULL,
	"voice" text DEFAULT 'ballad' NOT NULL,
	"opening_line" text NOT NULL,
	"presenting_story" text NOT NULL,
	"hidden_facts" jsonb NOT NULL,
	"emotional_state" text NOT NULL,
	"correct_outcome" text NOT NULL,
	"acceptable_alternatives" jsonb NOT NULL,
	"red_flags" jsonb NOT NULL,
	"unsafe_outcomes" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"approved_revision" integer,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "practice_scenarios_practice_library" UNIQUE("practice_id","library_scenario_id")
);
--> statement-breakpoint
CREATE TABLE "practices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suspended_at" timestamp with time zone,
	"allow_draft_scenarios" boolean DEFAULT false NOT NULL,
	"transcript_retention_days" integer
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"privacy_ack_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sign_in_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_normalised" CHECK ("users"."email" = lower(btrim("users"."email")))
);
--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "trainee_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "scenario_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "debriefs" ADD COLUMN "prompt_version" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "practice_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "practice_scenario_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "scenario_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_active_practice_id_practices_id_fk" FOREIGN KEY ("active_practice_id") REFERENCES "public"."practices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debrief_flags" ADD CONSTRAINT "debrief_flags_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debrief_flags" ADD CONSTRAINT "debrief_flags_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debrief_flags" ADD CONSTRAINT "debrief_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debrief_flags" ADD CONSTRAINT "debrief_flags_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_scenarios" ADD CONSTRAINT "practice_scenarios_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_scenarios" ADD CONSTRAINT "practice_scenarios_library_scenario_id_scenarios_id_fk" FOREIGN KEY ("library_scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_scenarios" ADD CONSTRAINT "practice_scenarios_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_scenarios" ADD CONSTRAINT "practice_scenarios_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_practice_at" ON "audit_log" USING btree ("practice_id","at");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitations_practice_id" ON "invitations" USING btree ("practice_id");--> statement-breakpoint
CREATE INDEX "memberships_user_id" ON "memberships" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_practice_scenario_id_practice_scenarios_id_fk" FOREIGN KEY ("practice_scenario_id") REFERENCES "public"."practice_scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_practice_started" ON "sessions" USING btree ("practice_id","started_at");--> statement-breakpoint
CREATE INDEX "sessions_user_started" ON "sessions" USING btree ("user_id","started_at");--> statement-breakpoint
ALTER TABLE "scenarios" DROP COLUMN "clinician_approved";