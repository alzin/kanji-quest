import { connections } from "./connections";
import { ideas } from "./ideas";
import { discovery } from "./discovery";
import { dailyLife } from "./daily-life";
import { seasons } from "./seasons";
import { wellbeing } from "./wellbeing";
import type { Kanji } from "../n5/types";

// Curated study scope, not an official JLPT syllabus. See SOURCES.md.
export const n4Kanji: Kanji[] = [...connections, ...ideas, ...discovery, ...dailyLife, ...seasons, ...wellbeing];
