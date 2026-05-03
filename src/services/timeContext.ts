const JENNIE_TIME_ZONE = "Asia/Kolkata";
const JENNIE_TIME_ZONE_LABEL = "India Standard Time (Asia/Kolkata, UTC+05:30)";

export interface JennieTimeContext {
  timeString: string;
  dateString: string;
  dayString: string;
  timeZone: string;
  timeZoneLabel: string;
  isoString: string;
}

export function getJennieTimeContext(date = new Date()): JennieTimeContext {
  const timeString = new Intl.DateTimeFormat("en-IN", {
    timeZone: JENNIE_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);

  const dateString = new Intl.DateTimeFormat("en-IN", {
    timeZone: JENNIE_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

  const dayString = new Intl.DateTimeFormat("en-IN", {
    timeZone: JENNIE_TIME_ZONE,
    weekday: "long",
  }).format(date);

  return {
    timeString,
    dateString,
    dayString,
    timeZone: JENNIE_TIME_ZONE,
    timeZoneLabel: JENNIE_TIME_ZONE_LABEL,
    isoString: date.toISOString(),
  };
}

export function getJennieTimeInstruction(): string {
  const context = getJennieTimeContext();
  return [
    "**REAL-TIME CONTEXT - SOURCE OF TRUTH:**",
    `- Current Time: ${context.timeString}`,
    `- Current Date: ${context.dateString}`,
    `- Current Day: ${context.dayString}`,
    `- Time Zone: ${context.timeZoneLabel}`,
    "If Pritish asks the current time, date, day, morning/evening, or what time it is, use ONLY this context.",
  ].join("\n");
}

export function withJennieTimeContext(prompt: string): string {
  return `${getJennieTimeInstruction()}\n\nUser message:\n${prompt}`;
}

export function isTimeQuestion(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(time|date|today|day|clock)\b/.test(lower) ||
    /(kitna|kitne)\s+baj/.test(lower) ||
    /(kya|kaunsa|kaun sa)\s+(din|date|tarikh|tareekh|samay|waqt)/.test(lower) ||
    /(samay|waqt|tarikh|tareekh)\s+(kya|kitna|bata|bta)/.test(lower) ||
    /(abhi|ab)\s+(kya\s+)?(time|samay|waqt)/.test(lower)
  );
}

export function formatJennieTimeReply(): string {
  const context = getJennieTimeContext();
  return `Abhi ${context.timeString} hai, ${context.dateString}. India time, boss.`;
}

export function getJennieCurrentHour(): number {
  const hour = new Intl.DateTimeFormat("en-IN", {
    timeZone: JENNIE_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date());

  return Number(hour);
}
