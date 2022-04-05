/**
 * Interface for queue track inputs.
 */
interface PrimitiveTrack {
    src: URL;
    data: Record<string, any>;
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
    history: Track[];
    curr: Track | null;
    nextSeek: Track[];
    next: { [key: string]: Track };
}

/**
 * Interface for mutation callback
 */
interface QueueMutationCallback {
    (args: any[]): void;
}

/**
 * Interface for the individual players being used in player.
 */
interface Players {
    sourceNode: MediaElementAudioSourceNode;
    gainNode: GainNode;
    scheduledEvent?: Function;
    play: Boolean;
}

/**
 * Interface for config object
 */
interface uncomplicatedConfig {
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
    crossfade: boolean;
    crossfadePlaylist: boolean;
    crossfadeQueue: boolean;
    crossfadeManualSwitch: boolean;
    crossfadeDuration: number;

    // logging configs
    loggingState: boolean;
    logger: { (log: string): void };
}

export {
    Queue,
    Track,
    PrimitiveTrack,
    Players,
    QueueMutationCallback,
    uncomplicatedConfig,
};
