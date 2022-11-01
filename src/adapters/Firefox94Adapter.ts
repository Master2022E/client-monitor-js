import {createLogger} from '../utils/logger';
import {StatsEntry} from '../utils/StatsVisitor';

import {Adapter, castStats} from './Adapter';

const logger = createLogger('Safari14Adapter');

export class Firefox94Adapter implements Adapter {
  /*eslint-disable @typescript-eslint/no-explicit-any */
  public *
      adapt(rtcStats: any): Generator<StatsEntry|undefined, void, undefined> {
    if (!rtcStats || !rtcStats.values ||
        typeof rtcStats.values !== 'function') {
      logger.warn(`not rtcStats object is provided to the adapter: `, rtcStats);
      return;
    }
    /*
    const tracks = new Map<string, any>();
    for (const rtcStatValue of rtcStats.values()) {
      console.log('Type:', rtcStatValue.type, rtcStatValue)
      if (rtcStatValue && rtcStatValue.type === 'track') {
        tracks.set(rtcStatValue.id, rtcStatValue);
      }
    }
    */
    //  Version 2
    const senders = new Map<string, any>();
    const receivers = new Map<string, any>();
    for (const rtcStatValue of rtcStats.values()) {
      const rawType = rtcStatValue.type;
      if (!rtcStatValue) continue;
      if (!rawType || typeof rawType !== 'string') continue;
      if (rawType === 'track' || rawType === 'remote-inbound-rtp' ||
          rawType === 'remote-outbound-rtp')
        continue;
      if (rawType === 'inbound-rtp' || rawType === 'outbound-rtp') {
        if (rtcStatValue.id) {
          /*const trackStats = rtcStatValue
          if (trackStats) {
            rtcStatValue = {
              ...trackStats,
              ...rtcStatValue,
            };*/
          console.log('rtcStatValue: ', rtcStatValue)
          if (rawType === 'outbound-rtp') {
            senders.set(rtcStatValue.id, rtcStatValue);
          }
          else if (rawType === 'inbound-rtp') {
            receivers.set(rtcStatValue.id, rtcStatValue);
          }
          //}
        }
        if (rtcStatValue.mediaType && !rtcStatValue.kind) {
          rtcStatValue.kind = rtcStatValue.mediaType;
        }
        if (rawType === 'inbound-rtp' && rtcStatValue.trackId &&
            !rtcStatValue.receiverId) {
          rtcStatValue.receiverId = rtcStatValue.trackId;
        }
        if (rawType === 'outbound-rtp' && rtcStatValue.trackId &&
            !rtcStatValue.senderId) {
          rtcStatValue.senderId = rtcStatValue.trackId;
        }
      } else if (
          rawType === 'local-candidate' || rawType === 'remote-candidate') {
        if (rtcStatValue.ip && !rtcStatValue.address) {
          rtcStatValue.address = rtcStatValue.ip;
        }
      }
      yield castStats(rawType, rtcStatValue);
    }
    for (const trackStats of senders.values()) {
      yield castStats('sender', trackStats);
    }
    for (const trackStats of receivers.values()) {
      yield castStats('receiver', trackStats);
    }
  }
}
