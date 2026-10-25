-- First migration: gives the migrator a journal. Tables arrive in 0001 (#3).
-- All timestamps are timestamptz, stored in UTC regardless of server time zone.
SELECT 1;
