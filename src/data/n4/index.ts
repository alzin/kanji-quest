import { connections } from "./connections";
import { ideas } from "./ideas";
import { discovery } from "./discovery";
import { dailyLife } from "./daily-life";
import { seasons } from "./seasons";
import { wellbeing } from "./wellbeing";
import type { Kanji } from "../n5/types";
import { arrangeRegions } from "../regions";

// Curated study scope, not an official JLPT syllabus. See SOURCES.md.
export const n4Kanji: Kanji[] = arrangeRegions([...connections, ...ideas, ...discovery, ...dailyLife, ...seasons, ...wellbeing], "N4");
