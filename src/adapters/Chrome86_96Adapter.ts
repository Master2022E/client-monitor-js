import { Adapter, castStats } from "./Adapter";
import { StatsEntry } from "../utils/StatsVisitor";


export class Chrome86_96Adapter implements Adapter {
    /*eslint-disable @typescript-eslint/no-explicit-any */
    public *adapt(rtcStats: any): Generator<StatsEntry | undefined, void, undefined> {
        if (!rtcStats || !rtcStats.values || typeof rtcStats.values !== 'function') {
            throw new Error(`not rtcStats object: ` + rtcStats);
        }
        /*eslint-disable @typescript-eslint/no-explicit-any */
        const tracks = new Map<string, any>();
        for (const rtcStatValue of rtcStats.values()) {
            if (rtcStatValue && rtcStatValue.type === "track") {
                tracks.set(rtcStatValue.ssrc, rtcStatValue);
            }
        }
        for (let rtcStatValue of rtcStats.values()) {
            const rawType = rtcStatValue.type;
            if (!rawType || typeof rawType !== 'string') continue;
            if (rawType === "inbound-rtp" || rawType === "outbound-rtp") {
                if (rtcStatValue.ssrc) {
                    const trackStats = tracks.get(rtcStatValue.ssrc);
                    if (trackStats) {
                        rtcStatValue = {
                            ...trackStats,
                            ...rtcStatValue,
                        }
                    }
                }
                if (rtcStatValue.mediaType && !rtcStatValue.kind) {
                    rtcStatValue.kind = rtcStatValue.mediaType;
                    delete rtcStatValue.mediaType;
                }
                if (rtcStatValue.trackId) {
                    delete rtcStatValue.trackId;
                }
            } else if (rawType === "local-candidate") {
                if (rtcStatValue.ip) {
                    if (!rtcStatValue.address) {
                        rtcStatValue.address = rtcStatValue.ip;
                    }
                    delete rtcStatValue.ip;
                }
                if (rtcStatValue.isRemote) {
                    delete rtcStatValue.isRemote;
                }
                if (rtcStatValue.networkType) {
                    delete rtcStatValue.networkType;
                }
            } else if (rawType === "remote-candidate") {
                if (rtcStatValue.ip) {
                    if (!rtcStatValue.address) {
                        rtcStatValue.address = rtcStatValue.ip;
                    }
                    delete rtcStatValue.ip;
                }
                if (rtcStatValue.isRemote) {
                    delete rtcStatValue.isRemote;
                }
            }
            yield castStats(rawType, rtcStatValue);
        }
    }
}