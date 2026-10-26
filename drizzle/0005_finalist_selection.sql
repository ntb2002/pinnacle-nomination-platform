CREATE TABLE "finalist_selection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"entry_ids" uuid[] NOT NULL,
	"tiebreak_reason" text,
	"ranking" jsonb NOT NULL,
	"selected_by_id" text NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finalist_selection_size" CHECK (cardinality("finalist_selection"."entry_ids") BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "finalist_selection" ADD CONSTRAINT "finalist_selection_cycle_id_award_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."award_cycle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finalist_selection" ADD CONSTRAINT "finalist_selection_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finalist_selection" ADD CONSTRAINT "finalist_selection_selected_by_id_user_id_fk" FOREIGN KEY ("selected_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finalist_selection_cycle_id_category_id_index" ON "finalist_selection" USING btree ("cycle_id","category_id");