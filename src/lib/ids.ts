import { z } from "zod";

/** True for a UUID. Ids from URLs and bound actions are checked before they reach SQL. */
export const isUuid = (value: string) => z.uuid().safeParse(value).success;
