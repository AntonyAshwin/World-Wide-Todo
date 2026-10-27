export const WD_SHORT  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export const WD_LETTER = ["S","M","T","W","T","F","S"];

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const TODAY    = todayKey();
export const TODAY_WD = new Date().getDay();
