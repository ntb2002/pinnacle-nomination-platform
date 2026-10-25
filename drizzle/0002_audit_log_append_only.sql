-- The audit log is append-only: reject UPDATE and DELETE on every row.
-- (TRUNCATE needs table ownership; in production the app's role must not own tables.
-- See LAUNCH_READINESS → database roles.)
CREATE OR REPLACE FUNCTION audit_log_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (% rejected)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_change();
