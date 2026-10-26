CREATE TYPE "public"."category_kind" AS ENUM('CORE', 'OPTIONAL');--> statement-breakpoint
CREATE TYPE "public"."cycle_phase" AS ENUM('NOMINATION', 'ROUND1_OPEN', 'ROUND1_CLOSED', 'FINALISTS_ANNOUNCED', 'ROUND2_OPEN', 'ROUND2_CLOSED', 'RESULTS_PUBLISHED');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('PENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED');--> statement-breakpoint
CREATE TYPE "public"."fee_tier" AS ENUM('EARLY', 'REGULAR', 'LATE');--> statement-breakpoint
CREATE TYPE "public"."nominator_relationship" AS ENUM('SELF', 'PEER', 'STAFF');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('ENTRY_FEE', 'FINALIST_FEE');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'PAID', 'EXPIRED', 'FAILED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."result_decision" AS ENUM('SCORE', 'TIEBREAK');--> statement-breakpoint
CREATE TYPE "public"."return_reason" AS ENUM('INCOMPLETE', 'WRONG_CATEGORY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('NOMINATOR', 'JUDGE', 'ADMIN');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'NOMINATOR' NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_email_lowercase" CHECK ("user"."email" = lower("user"."email"))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "award_cycle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"nominations_open_at" timestamp with time zone NOT NULL,
	"early_deadline" timestamp with time zone NOT NULL,
	"regular_deadline" timestamp with time zone NOT NULL,
	"final_deadline" timestamp with time zone NOT NULL,
	"early_fee_cents" integer NOT NULL,
	"regular_fee_cents" integer NOT NULL,
	"late_fee_cents" integer NOT NULL,
	"finalist_fee_cents" integer NOT NULL,
	"phase" "cycle_phase" DEFAULT 'NOMINATION' NOT NULL,
	"round1_opened_at" timestamp with time zone,
	"finalists_announced_at" timestamp with time zone,
	"round2_opened_at" timestamp with time zone,
	"results_published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "award_cycle_year_unique" UNIQUE("year"),
	CONSTRAINT "award_cycle_deadline_order" CHECK ("award_cycle"."nominations_open_at" < "award_cycle"."early_deadline" AND "award_cycle"."early_deadline" < "award_cycle"."regular_deadline" AND "award_cycle"."regular_deadline" < "award_cycle"."final_deadline"),
	CONSTRAINT "award_cycle_fees_nonnegative" CHECK ("award_cycle"."early_fee_cents" >= 0 AND "award_cycle"."regular_fee_cents" >= 0 AND "award_cycle"."late_fee_cents" >= 0 AND "award_cycle"."finalist_fee_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"kind" "category_kind" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"rubric_profile_id" uuid NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "category_id_cycle_unique" UNIQUE("id","cycle_id")
);
--> statement-breakpoint
CREATE TABLE "judge_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"organization" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubric_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"weight_impact" smallint NOT NULL,
	"weight_innovation" smallint NOT NULL,
	"weight_influence" smallint NOT NULL,
	"weight_references" smallint NOT NULL,
	CONSTRAINT "rubric_profile_weights_sum_100" CHECK ("rubric_profile"."weight_impact" + "rubric_profile"."weight_innovation" + "rubric_profile"."weight_influence" + "rubric_profile"."weight_references" = 100),
	CONSTRAINT "rubric_profile_weights_range" CHECK ("rubric_profile"."weight_impact" BETWEEN 0 AND 100 AND "rubric_profile"."weight_innovation" BETWEEN 0 AND 100 AND "rubric_profile"."weight_influence" BETWEEN 0 AND 100 AND "rubric_profile"."weight_references" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_storageKey_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"nominator_id" text NOT NULL,
	"relationship" "nominator_relationship" NOT NULL,
	"nominee_name" text,
	"nominee_title" text,
	"nominee_company" text,
	"nominee_email" text,
	"nominee_linkedin_url" text,
	"narrative" text,
	"status" "entry_status" DEFAULT 'DRAFT' NOT NULL,
	"is_finalist" boolean DEFAULT false NOT NULL,
	"finalist_fee_waived_at" timestamp with time zone,
	"finalist_fee_waived_by_id" text,
	"finalist_fee_waiver_reason" text,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_id_category_unique" UNIQUE("id","category_id")
);
--> statement-breakpoint
CREATE TABLE "entry_outcome" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"description" text NOT NULL,
	"data_point" text NOT NULL,
	CONSTRAINT "entry_outcome_position" CHECK ("entry_outcome"."position" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "entry_reference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"organization" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"relationship" text NOT NULL,
	CONSTRAINT "entry_reference_position" CHECK ("entry_reference"."position" BETWEEN 1 AND 2)
);
--> statement-breakpoint
CREATE TABLE "entry_status_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"from_status" "entry_status",
	"to_status" "entry_status" NOT NULL,
	"actor_id" text,
	"return_reason" "return_reason",
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"tier" "fee_tier",
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"provider" text NOT NULL,
	"provider_session_id" text NOT NULL,
	"provider_payment_intent_id" text,
	"created_by_id" text NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_providerSessionId_unique" UNIQUE("provider_session_id"),
	CONSTRAINT "payment_amount_positive" CHECK ("payment"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"provider" text NOT NULL,
	"id" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_event_provider_id_pk" PRIMARY KEY("provider","id")
);
--> statement-breakpoint
CREATE TABLE "category_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"winner_entry_id" uuid NOT NULL,
	"decision" "result_decision" NOT NULL,
	"tiebreak_reason" text,
	"confirmed_by_id" text NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_result_tiebreak_reason" CHECK ("category_result"."decision" <> 'TIEBREAK' OR ("category_result"."tiebreak_reason" IS NOT NULL AND length(trim("category_result"."tiebreak_reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "conflict_declaration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"judge_id" text NOT NULL,
	"entry_id" uuid NOT NULL,
	"has_conflict" boolean NOT NULL,
	"reason" text,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_id" text,
	"admin_note" text
);
--> statement-breakpoint
CREATE TABLE "judge_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"judge_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"round" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "judge_assignment_round" CHECK ("judge_assignment"."round" IN (1, 2))
);
--> statement-breakpoint
CREATE TABLE "score" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"judge_id" text NOT NULL,
	"entry_id" uuid NOT NULL,
	"round" smallint NOT NULL,
	"impact" smallint,
	"innovation" smallint,
	"influence" smallint,
	"reference_validation" smallint,
	"comment" text,
	"submitted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_round" CHECK ("score"."round" IN (1, 2)),
	CONSTRAINT "score_criteria_range" CHECK (("score"."impact" IS NULL OR "score"."impact" BETWEEN 1 AND 10) AND ("score"."innovation" IS NULL OR "score"."innovation" BETWEEN 1 AND 10) AND ("score"."influence" IS NULL OR "score"."influence" BETWEEN 1 AND 10) AND ("score"."reference_validation" IS NULL OR "score"."reference_validation" BETWEEN 1 AND 10)),
	CONSTRAINT "score_submitted_complete" CHECK ("score"."submitted_at" IS NULL OR ("score"."impact" IS NOT NULL AND "score"."innovation" IS NOT NULL AND "score"."influence" IS NOT NULL AND "score"."reference_validation" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" text,
	"actor_role" "user_role",
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"template" text NOT NULL,
	"text_body" text NOT NULL,
	"html_body" text NOT NULL,
	"dedupe_key" text,
	"status" "email_status" DEFAULT 'PENDING' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_outbox_dedupeKey_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_window" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_window_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_cycle_id_award_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."award_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_rubric_profile_id_rubric_profile_id_fk" FOREIGN KEY ("rubric_profile_id") REFERENCES "public"."rubric_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_profile" ADD CONSTRAINT "judge_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_profile" ADD CONSTRAINT "rubric_profile_cycle_id_award_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."award_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_cycle_id_award_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."award_cycle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_nominator_id_user_id_fk" FOREIGN KEY ("nominator_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_finalist_fee_waived_by_id_user_id_fk" FOREIGN KEY ("finalist_fee_waived_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_category_in_cycle_fk" FOREIGN KEY ("category_id","cycle_id") REFERENCES "public"."category"("id","cycle_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_outcome" ADD CONSTRAINT "entry_outcome_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_reference" ADD CONSTRAINT "entry_reference_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_status_event" ADD CONSTRAINT "entry_status_event_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_status_event" ADD CONSTRAINT "entry_status_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_result" ADD CONSTRAINT "category_result_cycle_id_award_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."award_cycle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_result" ADD CONSTRAINT "category_result_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_result" ADD CONSTRAINT "category_result_confirmed_by_id_user_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_result" ADD CONSTRAINT "category_result_winner_in_category_fk" FOREIGN KEY ("winner_entry_id","category_id") REFERENCES "public"."entry"("id","category_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_declaration" ADD CONSTRAINT "conflict_declaration_judge_id_user_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_declaration" ADD CONSTRAINT "conflict_declaration_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_declaration" ADD CONSTRAINT "conflict_declaration_recorded_by_id_user_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_assignment" ADD CONSTRAINT "judge_assignment_judge_id_user_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_assignment" ADD CONSTRAINT "judge_assignment_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_judge_id_user_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_index" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_index" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_index" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "award_cycle_one_active" ON "award_cycle" USING btree ("is_active") WHERE "award_cycle"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "category_cycle_id_slug_index" ON "category" USING btree ("cycle_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "rubric_profile_cycle_id_key_index" ON "rubric_profile" USING btree ("cycle_id","key");--> statement-breakpoint
CREATE INDEX "attachment_entry_id_index" ON "attachment" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "entry_cycle_id_category_id_status_index" ON "entry" USING btree ("cycle_id","category_id","status");--> statement-breakpoint
CREATE INDEX "entry_cycle_id_status_index" ON "entry" USING btree ("cycle_id","status");--> statement-breakpoint
CREATE INDEX "entry_nominator_id_index" ON "entry" USING btree ("nominator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entry_one_per_nominee_category" ON "entry" USING btree ("cycle_id","category_id","nominator_id",lower("nominee_email")) WHERE "entry"."nominee_email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "entry_outcome_entry_id_position_index" ON "entry_outcome" USING btree ("entry_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "entry_reference_entry_id_position_index" ON "entry_reference" USING btree ("entry_id","position");--> statement-breakpoint
CREATE INDEX "entry_status_event_entry_id_created_at_index" ON "entry_status_event" USING btree ("entry_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_entry_id_index" ON "payment" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_intent_unique" ON "payment" USING btree ("provider","provider_payment_intent_id") WHERE "payment"."provider_payment_intent_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_one_paid_per_kind" ON "payment" USING btree ("entry_id","kind") WHERE "payment"."status" = 'PAID';--> statement-breakpoint
CREATE UNIQUE INDEX "category_result_cycle_id_category_id_index" ON "category_result" USING btree ("cycle_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conflict_declaration_judge_id_entry_id_index" ON "conflict_declaration" USING btree ("judge_id","entry_id");--> statement-breakpoint
CREATE INDEX "conflict_declaration_entry_id_index" ON "conflict_declaration" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "judge_assignment_judge_id_category_id_round_index" ON "judge_assignment" USING btree ("judge_id","category_id","round");--> statement-breakpoint
CREATE INDEX "judge_assignment_category_id_round_index" ON "judge_assignment" USING btree ("category_id","round");--> statement-breakpoint
CREATE UNIQUE INDEX "score_judge_id_entry_id_round_index" ON "score" USING btree ("judge_id","entry_id","round");--> statement-breakpoint
CREATE INDEX "score_entry_id_round_index" ON "score" USING btree ("entry_id","round");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_index" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_id_created_at_index" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_target_type_target_id_index" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_log_action_index" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "email_outbox_to_address_created_at_index" ON "email_outbox" USING btree ("to_address","created_at");--> statement-breakpoint
CREATE INDEX "email_outbox_status_created_at_index" ON "email_outbox" USING btree ("status","created_at");