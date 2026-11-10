CREATE TABLE "debriefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"overall_score" integer NOT NULL,
	"outcome_correct" boolean NOT NULL,
	"unsafe_outcome" boolean DEFAULT false NOT NULL,
	"red_flag_handled" boolean,
	"rubric_scores" jsonb,
	"strengths" jsonb NOT NULL,
	"improvements" jsonb NOT NULL,
	"quoted_moments" jsonb NOT NULL,
	"model_used" text NOT NULL,
	CONSTRAINT "debriefs_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"difficulty" text NOT NULL,
	"persona" jsonb NOT NULL,
	"opening_line" text NOT NULL,
	"presenting_story" text NOT NULL,
	"hidden_facts" jsonb NOT NULL,
	"emotional_state" text NOT NULL,
	"correct_outcome" text NOT NULL,
	"acceptable_alternatives" jsonb NOT NULL,
	"red_flags" jsonb NOT NULL,
	"unsafe_outcomes" jsonb NOT NULL,
	"clinician_approved" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainee_name" text NOT NULL,
	"scenario_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"status" text DEFAULT 'created' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"speaker" text NOT NULL,
	"text" text NOT NULL,
	"sequence" integer NOT NULL,
	CONSTRAINT "transcript_turns_session_sequence" UNIQUE("session_id","sequence")
);
--> statement-breakpoint
ALTER TABLE "debriefs" ADD CONSTRAINT "debriefs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_turns" ADD CONSTRAINT "transcript_turns_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;