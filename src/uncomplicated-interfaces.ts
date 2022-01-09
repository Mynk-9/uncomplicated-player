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
}

export { Queue, Track, PrimitiveTrack, Players, QueueMutationCallback };
