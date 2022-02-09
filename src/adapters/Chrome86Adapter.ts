import { Adapter, castStats } from "./Adapter";
import { StatsEntry } from "../utils/StatsVisitor";


export class Chrome86Adapter implements Adapter {
    /*eslint-disable @typescript-eslint/no-explicit-any */
    public *adapt(rtcStats: any): Generator<StatsEntry | undefined, void, undefined> {
        if (!rtcStats || !rtcStats.values || typeof rtcStats.values !== 'function') {
            throw new Error(`not rtcStats object: ` + rtcStats);
        }
        const tracks = new Map<string, any>();
        for (const rtcStatValue of rtcStats.values()) {
            if (rtcStatValue && rtcStatValue.type === "track") {
                tracks.set(rtcStatValue.id, rtcStatValue);
            }
        }
        const senders = new Map<string, any>();
        const receivers = new Map<string, any>();
        for (let rtcStatValue of rtcStats.values()) {
            const rawType = rtcStatValue.type;
            if (!rtcStatValue) continue;
            if (!rawType || typeof rawType !== 'string') continue;
            if (rawType === "track") continue;
            if (rawType === "inbound-rtp" || rawType === "outbound-rtp") {
                if (rtcStatValue.trackId) {
                    const trackStats = tracks.get(rtcStatValue.trackId);
                    if (trackStats) {
                        rtcStatValue = {
                            ...trackStats,
                            ...rtcStatValue,
                        }
                        if (rawType === "outbound-rtp") {
                            senders.set(trackStats.id, trackStats);
                        } else if (rawType === "inbound-rtp") {
                            receivers.set(trackStats.id, trackStats);
                        }
                    }
                }
                if (rtcStatValue.mediaType && !rtcStatValue.kind) {
                    rtcStatValue.kind = rtcStatValue.mediaType;
                }
                if (rawType === "inbound-rtp" && rtcStatValue.trackId && !rtcStatValue.receiverId) {
                    rtcStatValue.receiverId = rtcStatValue.trackId;
                }
                if (rawType === "outbound-rtp" && rtcStatValue.trackId && !rtcStatValue.senderId) {
                    rtcStatValue.senderId = rtcStatValue.trackId;
                }
            } else if (rawType === "local-candidate" || rawType === "remote-candidate") {
                if (rtcStatValue.ip && !rtcStatValue.address) {
                    rtcStatValue.address = rtcStatValue.ip;
                }
            }
            yield castStats(rawType, rtcStatValue);
        }
        for (const trackStats of senders.values()) {
            yield castStats("sender", trackStats);
        }
        for (const trackStats of receivers.values()) {
            yield castStats("receiver", trackStats);
        }
    }
}