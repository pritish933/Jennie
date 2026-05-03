export type CommandCategory =
  | "BROWSER_OPEN"    // Open a URL in new tab
  | "MEDIA_PLAY"      // Play media internally
  | "MEDIA_STOP"      // Stop internal media
  | "SEARCH_GOOGLE"
  | "NONE";

export interface CommandResult {
  category: CommandCategory;
  action: string;           // Jennie's spoken response
  url?: string;             // For URL opens
  query?: string;           // For internal YouTube search
  isBrowserAction: boolean;
}

export function processCommand(command: string): CommandResult {
  const lowerCmd = command.toLowerCase().trim();

  // ── MEDIA PLAY (Internal YouTube Embed) ──────────────────────────────────
  if (
    lowerCmd.match(/^(play|chalao|laga do)\s+(.+)$/) ||
    lowerCmd.match(/(.+?) (gaana chalao|song play|play karo|laga do)/) ||
    lowerCmd.match(/^play\s+(.+?)\s+on\s+youtube$/) ||
    lowerCmd.match(/^youtube par (.+?) (chalao|play karo|laga do)$/)
  ) {
    const match = lowerCmd.match(/^(?:play|chalao|laga do)\s+(.+?)(?:\s+on\s+youtube)?$/) ||
                  lowerCmd.match(/^(.+?)\s+(?:gaana chalao|song play|play karo|laga do)$/) ||
                  lowerCmd.match(/^youtube par (.+?) (?:chalao|play karo|laga do)$/);
    
    if (match && match[1]) {
      const query = match[1].trim();
      return {
        category: "MEDIA_PLAY",
        action: `Tumhare liye ${query} chala rahi hoon. I hope you like it!`,
        query: query,
        isBrowserAction: true,
      };
    }
  }

  // ── MEDIA STOP ────────────────────────────────────────────────────────────
  if (
    lowerCmd.match(/^(pause|roko|rok do|stop karo|band karo)$/) ||
    lowerCmd.match(/video (pause|roko|band karo)/) ||
    lowerCmd.match(/gaana (roko|pause karo|band karo)/)
  ) {
    return {
      category: "MEDIA_STOP",
      action: "Gaana band kar diya.",
      isBrowserAction: true,
    };
  }

  // ── SEARCH GOOGLE ─────────────────────────────────────────────────────────
  const googleMatch =
    lowerCmd.match(/^(?:google|search google for|google par search karo|google mein dhundo)\s+(.+)$/) ||
    lowerCmd.match(/^search (.+?) (?:on google|on the web|google par)$/) ||
    lowerCmd.match(/^(.+?) google par (search|dhundo|khojo)$/);
  if (googleMatch) {
    const query = encodeURIComponent((googleMatch[1] || googleMatch[2] || "").trim());
    return {
      category: "SEARCH_GOOGLE",
      action: `Google par search kar rahi hoon.`,
      url: `https://www.google.com/search?q=${query}`,
      isBrowserAction: true,
    };
  }

  // ── OPEN WEBSITE ──────────────────────────────────────────────────────────
  const openMatch = lowerCmd.match(/^open\s+(.+)$/) ||
    lowerCmd.match(/^(.+?) (kholo|open karo|par jao|pe jao)$/);
  if (openMatch) {
    let site = (openMatch[1] || "").trim().replace(/\s+/g, "");
    if (site && !["tab", "window", "naya", "new"].includes(site)) {
      if (!site.includes(".")) site += ".com";
      return {
        category: "BROWSER_OPEN",
        action: `${openMatch[1]} khol rahi hoon.`,
        url: `https://www.${site}`,
        isBrowserAction: true,
      };
    }
  }

  // ── WHATSAPP ──────────────────────────────────────────────────────────────
  const waMatch = lowerCmd.match(
    /^send\s+a?\s*whatsapp\s+message\s+to\s+([\d\+\s]+)\s+saying\s+(.+)$/
  );
  if (waMatch) {
    const number = waMatch[1].replace(/\s+/g, "");
    const message = encodeURIComponent(waMatch[2].trim());
    return {
      category: "BROWSER_OPEN",
      action: `WhatsApp message bhej rahi hoon.`,
      url: `https://web.whatsapp.com/send?phone=${number}&text=${message}`,
      isBrowserAction: true,
    };
  }

  return { category: "NONE", action: "", isBrowserAction: false };
}
