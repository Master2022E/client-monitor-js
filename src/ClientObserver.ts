import { Browser, Engine, ExtensionStat, MediaDevice, OperationSystem, Platform } from "@observertc/schemas"
import { CollectorConfig, Collector, PcStatsCollector } from "./Collector";
import { EventsRegister, EventsRelayer } from "./EventsRelayer";
import { Sampler, SamplerConfig, supplyDefaultConfig as supplySamplerDefaultConfig, TrackRelation } from "./Sampler";
import { Sender, SenderConfig } from "./Sender";
import { ClientDevices } from "./ClientDevices";
import { MediaDevices } from "./utils/MediaDevices";
import { AdapterConfig } from "./adapters/Adapter";
import { Timer } from "./utils/Timer";
import { StatsReader, StatsStorage } from "./entries/StatsStorage";
import { Accumulator, AccumulatorConfig } from "./Accumulator";
import { LogLevelDesc } from "loglevel";
import { createLogger } from "./utils/logger";

const logger = createLogger("ClientObserver");

export type ClientObserverConfig = {
    /**
     * By setting it, the observer calls the added statsCollectors periodically
     * and pulls the stats.
     * 
     * DEFAULT: undefined
     */
    collectingPeriodInMs?: number;
    /**
     * By setting it, the observer make samples periodically.
     * 
     * DEFAULT: undefined
     */
    samplingPeriodInMs?: number;
    /**
     * By setting it, the observer sends the samples periodically.
     * 
     * DEFAULT: undefined
     */
    sendingPeriodInMs?: number;

    /**
     * By setting it stats items and entries are deleted if they are not updated.
     * 
     * DEFAULT: undefined
     */
    statsExpirationTimeInMs?: number;

    /**
     * Collector Component related configurations
     */
    collectors?: CollectorConfig;

    /**
     * Sampling Component Related configurations
     * 
     */
    sampler: SamplerConfig;

    /**
     * Sending Component Related congurations
     * 
     * default: undefined, means no sample is sent
     */
    sender?: SenderConfig;

    /**
     * If the sender component is configured, 
     * accumulator sets the buffer between sampling and sending.
     */
    accumulator?: AccumulatorConfig,
};

type ConstructorConfig = ClientObserverConfig;

const supplyDefaultConfig = () => {
    const defaultConfig: ConstructorConfig = {
        // samplingPeriodInMs: 5000,
        // sendingPeriodInMs: 10000,
        sampler: supplySamplerDefaultConfig(),
    }
    return defaultConfig;
}

export interface IClientObserver {
    /**
     * Information about the client devices
     */
    readonly os: OperationSystem;
    readonly browser: Browser;
    readonly platform: Platform;
    readonly engine: Engine;
    // readonly mediaDevices: IterableIterator<MediaDevice>;

    readonly audioInputs: IterableIterator<MediaDevice>;
    readonly audioOutputs: IterableIterator<MediaDevice>
    readonly videoInputs: IterableIterator<MediaDevice>

    readonly stats: StatsReader;

    // readonly devices: ClientDevices;
    readonly events: EventsRegister;

    addTrackRelation(trackRelation: TrackRelation): void;
    removeTrackRelation(trackId: string): void;

    addStatsCollector(collector: PcStatsCollector): void;
    removeStatsCollector(peerConnectionId: string): void;
    /**
     * extracted stats map
     */
    // readonly peerConnections: IterableIterator<PeerConnectionEntry>;
    addMediaDevice(device: MediaDevice): void;
    removeMediaDevice(device: MediaDevice): void;

    addMediaConstraints(constrain: string): void;
    /**
     * 
     * @param message 
     */
    addUserMediaError(message: string): void;
    addExtensionStats(stats: ExtensionStat): void;

    // detectClientDevice(): void;
    setMarker(marker: string): void;

    /**
     * Collect Stats
     */
    collect(): Promise<void>;
    /**
     * Make client sample from a collected stats
     */
    sample(): Promise<void>;
    /**
     * Explicit command to send samples
     */
    send(): Promise<void>; 

    close(): void;
}

export class ClientObserver implements IClientObserver {
     /**
     * Sets the level of logging of the module
     * 
     * possible values are: "TRACE", "DEBUG", "INFO", "WARN", "ERROR", "SILENT"
     */
    public static setLogLevel(level: LogLevelDesc) {
        logger.setLevel(level);
    }
    /**
     * Create ClientObserver
     * @param config the passed config
     */
    public static create(config?: ClientObserverConfig): ClientObserver {
        const appliedConfig = config ? Object.assign(supplyDefaultConfig(), config) : supplyDefaultConfig();
        return new ClientObserver(appliedConfig);
    }

    private _closed = false;
    private _config: ConstructorConfig;
    private _mediaDevices: MediaDevices;
    private _clientDevices: ClientDevices;
    private _collector: Collector;
    private _sampler: Sampler;
    private _sender?: Sender;
    private _timer?: Timer;
    private _eventer: EventsRelayer;
    private _statsStorage: StatsStorage;
    private _accumulator: Accumulator;
    private constructor(config: ConstructorConfig) {
        this._config = config;
        this._clientDevices = new ClientDevices();
        this._mediaDevices = new MediaDevices();
        this._statsStorage = new StatsStorage();
        this._accumulator = Accumulator.create(config.accumulator);
        this._eventer = EventsRelayer.create();
        this._collector = this._makeCollector();
        this._sampler = this._makeSampler();
        this._sender = this._makeSender();
        this._timer = this._makeTimer();

        this._sampler.addEngine(this._clientDevices.engine);
        this._sampler.addPlatform(this._clientDevices.platform);
        this._sampler.addBrowser(this._clientDevices.browser);
        this._sampler.addOs(this._clientDevices.os);
    }
    
    public get clientId() : string {
        /* eslint-disable @typescript-eslint/no-non-null-assertion */
        return this._sampler.clientId!;
    }

    public get callId() : string | undefined {
        return this._sampler.callId;
    }

    public get os(): OperationSystem {
        return this._clientDevices.os;
    }

    public get browser(): Browser {
        return this._clientDevices.browser;
    }

    public get platform(): Platform {
        return this._clientDevices.platform;
    }

    public get engine(): Engine {
        return this._clientDevices.engine;
    }

    public get audioInputs(): IterableIterator<MediaDevice> {
        return this._mediaDevices.values("audioinput");
    }

    public get audioOutputs(): IterableIterator<MediaDevice> {
        return this._mediaDevices.values("audiooutput");
    }

    public get videoInputs(): IterableIterator<MediaDevice> {
        return this._mediaDevices.values("videoinput");
    }

    public get events(): EventsRegister {
        return this._eventer;
    }

    public get stats(): StatsReader {
        return this._statsStorage;
    }

    public addTrackRelation(trackRelation: TrackRelation): void {
        this._sampler.addTrackRelation(trackRelation);
    }

    public removeTrackRelation(trackId: string): void {
        this._sampler.removeTrackRelation(trackId);
    }

    public addStatsCollector(collector: PcStatsCollector): void {
        this._collector.add(collector);
        this._statsStorage.register(collector.id, collector.label);
    }

    public removeStatsCollector(collectorId: string): void {
        this._collector.remove(collectorId);
        this._statsStorage.unregister(collectorId);
    }

    public addMediaDevice(device: MediaDevice): void {
        this._mediaDevices.add(device);
        this._sampler.addMediaDevice(device);
    }

    public removeMediaDevice(device: MediaDevice): void {
        if (device.id === undefined) return;
        this._mediaDevices.remove(device.id);
    }

    public addMediaConstraints(constrain: string): void {
        this._sampler.addMediaConstraints(constrain);
    }

    public addUserMediaError(message: string): void {
        this._sampler.addUserMediaError(message);
    }

    public addExtensionStats(stats: ExtensionStat): void {
        this._sampler.addExtensionStats(stats);
    }

    public setMarker(marker: string): void {
        this._sampler.setMarker(marker);
    }

    public async collect(): Promise<void> {
        await this._collector.collect().catch(err => {
            logger.warn(`Error occurred while collecting`, err);
        });
        this._eventer.emitStatsCollected();

        if (this._config.statsExpirationTimeInMs) {
            const expirationThresholdInMs = Date.now() - this._config.statsExpirationTimeInMs;
            this._statsStorage.trim(expirationThresholdInMs);
        }
        
    }

    public async sample(): Promise<void> {
        const clientSample = this._sampler.make();
        if (!clientSample) return;
        if (this._sender) {
            this._accumulator.addClientSample(clientSample);    
        }
        this._eventer.emitSampleCreated(clientSample);
    }

    public async send(): Promise<void> {
        if (!this._sender) {
            throw new Error(`Cannot send samples, because no Sender has been configured`);
        }
        const promises: Promise<void>[] = [];
        this._accumulator.drainTo(samples => {
            if (!samples) return;
            /* eslint-disable @typescript-eslint/no-non-null-assertion */
            const promise = this._sender!.send(samples);
            promises.push(promise);
        });
        await Promise.all(promises).catch(async err => {
            logger.warn(err);
            if (!this._sender) return;
            if (!this._sender.closed) {
                await this._sender.close();
            }
            this._sender = undefined;
        });
        this._eventer.emitSampleSent();
    }

    public close(): void {
        if (this._closed) {
            logger.warn(`Attempted to close twice`);
            return;
        }
        this._closed = true;
        if (this._timer) {
            this._timer.clear();
        }
        this._collector.close();
        this._sampler.close();
        this._sender?.close();
        this._statsStorage.clear();
    }

    private _makeCollector(): Collector {
        const collectorConfig = this._config.collectors;
        const createdAdapterConfig: AdapterConfig = {
            browserType: this._clientDevices.browser?.name,
            browserVersion: this._clientDevices.browser?.version,       
        };
        const appliedCollectorsConfig: CollectorConfig = Object.assign({ adapter: createdAdapterConfig }, collectorConfig);
        const result = Collector.builder()
            .withConfig(appliedCollectorsConfig)
            .build();
        result.statsAcceptor = this._statsStorage;
        return result;
    }

    private _makeSampler(): Sampler {
        const samplerConfig = this._config.sampler;
        const result = Sampler.builder()
            .withConfig(samplerConfig)
            .build();
        result.statsProvider = this._statsStorage;
        return result;
    }

    private _makeSender(): Sender | undefined {
        const senderConfig = this._config.sender;
        if (!senderConfig) {
            return undefined;
        }
        const result = Sender.create(senderConfig);
        return result;
    }

    private _makeTimer(): Timer | undefined {
        const {
            collectingPeriodInMs,
            samplingPeriodInMs,
            sendingPeriodInMs,
        } = this._config;
        if (!collectingPeriodInMs && !samplingPeriodInMs && !sendingPeriodInMs) {
            return undefined;
        }
        const result = new Timer();
        if (collectingPeriodInMs && 0 < collectingPeriodInMs) {
            result.add({
                type: "collect",
                process: this.collect.bind(this),
                fixedDelayInMs: collectingPeriodInMs,
                context: "Collect Stats"
            });
        }
        if (samplingPeriodInMs && 0 < samplingPeriodInMs) {
            result.add({
                type: "sample",
                process: this.sample.bind(this),
                fixedDelayInMs: samplingPeriodInMs,
                context: "Creating Sample"
            });
        }
        if (sendingPeriodInMs && 0 < sendingPeriodInMs) {
            result.add({
                type: "send",
                process: this.send.bind(this),
                fixedDelayInMs: sendingPeriodInMs,
                context: "Sending Samples"
            });
        }
        return result;
    }
}