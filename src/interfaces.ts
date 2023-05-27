/** Track Data of Primitive Track */
type PrimitiveTrackData = Record<string, any>;
type QueueHistory = Track[];
type QueueCurr = Track | null;
type QueueNextSeek = Track[];
type QueueNext = { [key: string]: Track };

/**
 * Interface for queue track inputs.
 */
interface PrimitiveTrack {
    src: URL;
    data: PrimitiveTrackData;
}
/**
 * Interface for queue tracks.
 */
interface Track extends PrimitiveTrack {
    key: number;
}

/**
 * Interface for the Queue
 */
interface Queue {
    history: QueueHistory;
    curr: QueueCurr;
    nextSeek: QueueNextSeek;
    next: QueueNext;
}

/**
 * Interface for mutation callback
 */
interface QueueMutationCallback {
    (args: unknown[]): void;
}

/**
 * Interface for the individual players being used in player.
 */
interface Players {
    sourceNode: MediaElementAudioSourceNode;
    crossfadeNode: GainNode;
    gainNode: GainNode;
    scheduledEvent?: () => void;
    state: number;
}

/**
 * Params for crossfade
 */
interface CrossfadeParams {
    crossfade: boolean;
    crossfadePlaylist: boolean;
    crossfadeQueue: boolean;
    crossfadeManualSwitch: boolean;
    crossfadeDuration: number;
}

/**
 * Interface for config object
 */
interface UncomplicatedConfig extends CrossfadeParams {
    // global player states
    globalPlay: boolean;
    globalGain: number;

    // gain configs
    gainDelta: number;
    allowGainBoost: boolean;
    smoothGainTransition: boolean;
    smoothGainTransitionDuration: number;

    // prefetch configs
    prefetch: boolean;
    prefetchSize: number;

    // crossfade configs
    // imported from CrossfadeParams

    // logging configs
    loggingState: boolean;
    logger: { (...log: any): void };
}

export {
    QueueHistory,
    QueueCurr,
    QueueNextSeek,
    QueueNext,
    Queue,
    Track,
    PrimitiveTrackData,
    PrimitiveTrack,
    Players,
    QueueMutationCallback,
    CrossfadeParams,
    UncomplicatedConfig,
};
