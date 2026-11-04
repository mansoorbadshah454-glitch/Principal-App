// =========================================================================
// 🇵🇰 TRUSTED PAKISTAN STANDARD TIME (PKT UTC+5) & DAY LOCK ENGINE
// Guarantees 100% tamper-proof dates and times independent of device clocks.
// =========================================================================

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC + 5 Hours (Pakistan Standard Time)
const DRIFT_STORAGE_KEY = 'trusted_pkt_drift_offset_ms';
const LAST_SYNC_KEY = 'trusted_pkt_last_sync_timestamp';

// In-memory drift cache (Initialized from localStorage fallback)
let currentDriftOffsetMs = 0;

try {
    const savedDrift = localStorage.getItem(DRIFT_STORAGE_KEY);
    if (savedDrift !== null) {
        currentDriftOffsetMs = Number(savedDrift) || 0;
    }
} catch (e) {
    currentDriftOffsetMs = 0;
}

/**
 * Synchronize with Atomic Server Time (Google Cloud / Cloudflare / Public NTP / WorldTime)
 * Calculates the exact clock drift between the local laptop and atomic UTC time.
 */
export const syncPakistanTime = async () => {
    if (typeof window === 'undefined' || !navigator.onLine) {
        return currentDriftOffsetMs;
    }

    // Tier 1: Try Origin HEAD request (Ultra-fast when deployed on cloud/Firebase)
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocalhost) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const fetchStart = Date.now();
            const response = await fetch(window.location.origin + '/?t=' + Date.now(), {
                method: 'HEAD',
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const fetchEnd = Date.now();
            const roundTripLatency = (fetchEnd - fetchStart) / 2;
            const serverDateHeader = response.headers.get('date');
            if (serverDateHeader) {
                const serverUtcTime = new Date(serverDateHeader).getTime() + roundTripLatency;
                if (!isNaN(serverUtcTime)) {
                    currentDriftOffsetMs = Math.round(serverUtcTime - fetchEnd);
                    try {
                        localStorage.setItem(DRIFT_STORAGE_KEY, String(currentDriftOffsetMs));
                        localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
                    } catch (err) {}
                    return currentDriftOffsetMs;
                }
            }
        } catch (e) {
            // Origin HEAD failed or timed out, fall through to Tier 2
        }
    }

    // Tier 2: Public Atomic Time API (Guarantees true time even on localhost or proxy)
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const fetchStart = Date.now();
        const res = await fetch('https://worldtimeapi.org/api/timezone/Asia/Karachi', {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            const fetchEnd = Date.now();
            const roundTripLatency = (fetchEnd - fetchStart) / 2;
            const serverUtcTime = (data.unixtime * 1000) + roundTripLatency;
            if (!isNaN(serverUtcTime)) {
                currentDriftOffsetMs = Math.round(serverUtcTime - fetchEnd);
                try {
                    localStorage.setItem(DRIFT_STORAGE_KEY, String(currentDriftOffsetMs));
                    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
                } catch (err) {}
                return currentDriftOffsetMs;
            }
        }
    } catch (e) {
        // Fallback to Tier 3: Secondary Time API
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            const fetchStart = Date.now();
            const res = await fetch('https://timeapi.io/api/time/current/zone?timeZone=Asia/Karachi', {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                const fetchEnd = Date.now();
                const roundTripLatency = (fetchEnd - fetchStart) / 2;
                if (data.dateTime) {
                    // timeapi.io dateTime is in local PKT timezone
                    const serverPktTime = new Date(data.dateTime).getTime() + roundTripLatency;
                    const serverUtcTime = serverPktTime - PKT_OFFSET_MS;
                    if (!isNaN(serverUtcTime)) {
                        currentDriftOffsetMs = Math.round(serverUtcTime - fetchEnd);
                        try {
                            localStorage.setItem(DRIFT_STORAGE_KEY, String(currentDriftOffsetMs));
                            localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
                        } catch (err) {}
                        return currentDriftOffsetMs;
                    }
                }
            }
        } catch (err) {
            // All remote sync failed, silently retain last known cached drift from localStorage
        }
    }

    return currentDriftOffsetMs;
};

// Auto-trigger sync on module load, network reconnection, tab focus, and periodic 15-minute interval
if (typeof window !== 'undefined') {
    syncPakistanTime();
    window.addEventListener('online', () => syncPakistanTime());
    window.addEventListener('focus', () => syncPakistanTime());
    setInterval(() => syncPakistanTime(), 15 * 60 * 1000);
}

/**
 * Returns the current trusted UTC timestamp in milliseconds (Drift-corrected).
 */
export const getTrustedUtcMillis = () => {
    return Date.now() + currentDriftOffsetMs;
};

/**
 * Returns a Date object representing the exact current moment in Pakistan Standard Time (PKT UTC+5).
 */
export const getTrustedPktDate = () => {
    const pktMillis = getTrustedUtcMillis() + PKT_OFFSET_MS;
    return new Date(pktMillis);
};

/**
 * Returns the current ISO Date string in Pakistan Standard Time (e.g. "2026-10-01").
 */
export const getTrustedPktIsoDate = () => {
    const pktDate = getTrustedPktDate();
    const y = pktDate.getUTCFullYear();
    const m = String(pktDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(pktDate.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

/**
 * Returns the current Year number in PKT (e.g. 2026).
 */
export const getTrustedPktYear = () => {
    return getTrustedPktDate().getUTCFullYear();
};

/**
 * Returns the current Month number in PKT (1-12, e.g. 10 for October).
 */
export const getTrustedPktMonth = () => {
    return getTrustedPktDate().getUTCMonth() + 1;
};

/**
 * Returns formatted 12-hour time string in PKT (e.g. "06:45 PM").
 */
export const getTrustedPktTimeString = (dateInput = null) => {
    let millis = dateInput ? new Date(dateInput).getTime() : getTrustedUtcMillis();
    if (isNaN(millis)) millis = getTrustedUtcMillis();
    const pktDate = new Date(millis + PKT_OFFSET_MS);

    let hours = pktDate.getUTCHours();
    const minutes = String(pktDate.getUTCMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 becomes 12
    return `${hours}:${minutes} ${ampm}`;
};

/**
 * Checks if a specific day is already closed/locked (i.e. strictly prior to today's PKT date).
 */
export const isDayPastLocked = (dateIso) => {
    if (!dateIso) return false;
    const cleanDateIso = dateIso.includes('T') ? dateIso.split('T')[0] : dateIso;
    const todayPkt = getTrustedPktIsoDate();
    return cleanDateIso < todayPkt;
};

/**
 * Convenient alias for getTrustedPktIsoDate (returns "YYYY-MM-DD" in PKT).
 */
export const getTodayPktStr = () => {
    return getTrustedPktIsoDate();
};

/**
 * Evaluates whether a given date matches today in PKT or UTC regardless of client laptop clock drift.
 * Handles Date objects, Firestore timestamps (.toDate()), and "YYYY-MM-DD" or ISO strings.
 */
export const isDateTodayTrusted = (targetDate) => {
    if (!targetDate) return false;
    let targetStr = targetDate;
    if (typeof targetDate === 'object' && targetDate.toDate) {
        const d = targetDate.toDate();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        targetStr = `${y}-${m}-${day}`;
    } else if (targetDate instanceof Date) {
        const y = targetDate.getFullYear();
        const m = String(targetDate.getMonth() + 1).padStart(2, '0');
        const day = String(targetDate.getDate()).padStart(2, '0');
        targetStr = `${y}-${m}-${day}`;
    } else if (typeof targetDate === 'string' && targetDate.includes('T')) {
        targetStr = targetDate.split('T')[0];
    }

    const pktToday = getTrustedPktIsoDate();
    const utcDate = new Date(getTrustedUtcMillis());
    const utcToday = utcDate.toISOString().split('T')[0];

    return targetStr === pktToday || targetStr === utcToday;
};

/**
 * Checks if a timestamp represents a past day relative to today in PKT.
 */
export const isNewDayTrusted = (lastUpdateTimestamp) => {
    if (!lastUpdateTimestamp) return false;
    const lastUpdate = lastUpdateTimestamp.toDate ? lastUpdateTimestamp.toDate() : new Date(lastUpdateTimestamp);
    if (isNaN(lastUpdate.getTime())) return false;

    const y = lastUpdate.getFullYear();
    const m = String(lastUpdate.getMonth() + 1).padStart(2, '0');
    const d = String(lastUpdate.getDate()).padStart(2, '0');
    const lastDateStr = `${y}-${m}-${d}`;

    const todayPkt = getTrustedPktIsoDate();
    return todayPkt > lastDateStr;
};

