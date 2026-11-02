/** Local, bounded breadcrumbs; OS/native termination may never deliver an error callback. */
export const DIAGNOSTICS_KEY = 'relic-runtime-diagnostics';
type Summary = Record<string, string | number | boolean | null | undefined>;
interface Session {
    version: string;
    startedAt: number;
    device: Summary;
    events: {
        at: number;
        type: string;
        detail?: string;
        state?: Summary;
    }[];
}
interface DiagnosticsAPI {
    getSystemInfoSync(): {
        model?: string;
        system?: string;
        SDKVersion?: string;
        version?: string;
        platform?: string;
    };
    getStorageSync(key: string): unknown;
    setStorageSync(key: string, value: string): void;
    onError?(callback: (error: unknown) => void): void;
    onUnhandledRejection?(callback: (event: {
        reason?: unknown;
    }) => void): void;
    onMemoryWarning?(callback: (event: {
        level?: number;
    }) => void): void;
    onHide?(callback: () => void): void;
    onShow?(callback: () => void): void;
    setClipboardData?(options: {
        data: string;
    }): void;
}
export function createWechatDiagnostics(api: DiagnosticsAPI, version: string, timers = { setInterval, clearInterval }) {
    let previous: Session | null = null, snapshot: (() => Summary) | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    try {
        const value = api.getStorageSync(DIAGNOSTICS_KEY);
        if (typeof value === 'string' && value.length <= 32768) {
            const parsed = JSON.parse(value);
            if (parsed.current && Array.isArray(parsed.current.events))
                previous = parsed.current;
        }
    }
    catch { }
    let device: Summary = {};
    try {
        const info = api.getSystemInfoSync();
        device = {
            model: info.model, system: info.system, SDKVersion: info.SDKVersion, wechat: info.version, platform: info.platform
        };
    }
    catch { }
    const current: Session = { version, startedAt: Date.now(), device, events: [] };
    const report = () => ({ schema: 1, previous, current });
    const detailOf = (value: unknown): string => {
        try {
            if (typeof value === 'string')
                return value.slice(0, 1024);
            if (value && typeof value === 'object' && 'stack' in value)
                return String(value.stack).slice(0, 1024);
            return String(value).slice(0, 1024);
        }
        catch {
            return 'unreadable';
        }
    };
    const record = (type: string, detail?: string) => {
        let state: Summary | undefined;
        try {
            const raw = snapshot?.();
            if (raw) {
                state = {};
                for (const [key, value] of Object.entries(raw).slice(0, 32))
                    if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) || value === null)
                        state[key.slice(0, 48)] = typeof value === 'string' ? value.slice(0, 128) : value;
            }
        }
        catch { }
        current.events.push({ at: Date.now(), type, detail, state });
        // Retain exceptional events separately from periodic samples.
        for (const periodic of [true, false]) {
            const matching = current.events.filter(e => (e.type === 'sample') === periodic);
            while (matching.length > (periodic ? 12 : 8))
                current.events.splice(current.events.indexOf(matching.shift()!), 1);
        }
        try {
            let data = JSON.stringify(report());
            while (data.length > 32768 && (previous?.events.length || current.events.length > 1)) {
                const events = previous?.events.length ? previous.events : current.events;
                const sample = events.findIndex(e => e.type === 'sample');
                events.splice(sample < 0 ? 0 : sample, 1);
                data = JSON.stringify(report());
            }
            api.setStorageSync(DIAGNOSTICS_KEY, data);
        }
        catch { }
    };
    try {
        api.onError?.(error => record('error', detailOf(error)));
    }
    catch { }
    try {
        api.onUnhandledRejection?.(event => record('rejection', detailOf(event?.reason)));
    }
    catch { }
    try {
        api.onMemoryWarning?.(event => record('memory-warning', detailOf(event?.level)));
    }
    catch { }
    try {
        api.onHide?.(() => record('hide'));
    }
    catch { }
    try {
        api.onShow?.(() => record('show'));
    }
    catch { }
    record('startup');
    return {
        report,
        attach(provider: () => Summary): void {
            snapshot = provider;
            if (interval !== undefined)
                timers.clearInterval(interval);
            record('ready');
            interval = timers.setInterval(() => record('sample'), 10000);
        },
        copy(): void {
            try {
                api.setClipboardData?.({ data: JSON.stringify(report()) });
            }
            catch { }
        },
        stop(): void {
            if (interval !== undefined)
                timers.clearInterval(interval);
            interval = undefined;
        },
    };
}
