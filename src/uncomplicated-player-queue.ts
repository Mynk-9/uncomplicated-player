/**
 * Interface for Queue tracks.
 */
interface Track {
    key?: number;
    src: URL | null;
    data: Record<string, any>;
}

/**
 * Interface for the Queue
 */
interface Queue {
    prev: Track[];
    curr: Track;
    next: Track[];
}

class UncomplicatedPlayerQueue {
    private queue: Queue;
    private shufflePlaylist: boolean;
    private tracksKeyCounter: number;

    constructor() {
        this.queue = {
            prev: [],
            curr: { src: null, data: {} },
            next: [],
        };
        this.shufflePlaylist = false;
        this.tracksKeyCounter = -1;
    }

    /**
     * Compares comp to original, checks recursively for all properties
     * and objects as values of properties in comp with original
     * @param {Object} original original object
     * @param {Object} comp object to compare
     * @returns {Boolean} true if match, false otherwise
     */
    private recursiveCompare(
        original: Record<string, any>,
        comp: Record<string, any>
    ): boolean {
        if (comp === original) return true;

        for (const key in comp) {
            if (typeof comp[key] === 'object') {
                if (!this.recursiveCompare(original[key], comp[key]))
                    return false;
            } else if (comp[key] !== original[key]) return false;
        }

        return true;
    }

    /**
     * Adds new track to the queue
     * @param {Track} track track to be added to the queue
     * @returns {number} key of added track
     */
    public push(track: Track): number {
        this.queue.next.push({ ...track, key: ++this.tracksKeyCounter });
        return this.tracksKeyCounter;
    }

    /**
     * Added multiple tracks to the crew and returns the array with tracks key
     * added to each Track object.
     * @param {Track[]} tracks tracks array to be added to the queue
     * @returns {Track[]} tracks array with respective key added to each track
     */
    public pushMany(tracks: Track[]): Track[] {
        tracks = tracks.map(track => ({
            ...track,
            key: ++this.tracksKeyCounter,
        }));
        this.queue.next.push(...tracks);
        return tracks;
    }

    /**
     * Removes the last track from the queue.
     * @returns key of the track, if no track exists then -1
     */
    public pop(): number {
        let removedTrack: Track = this.queue.next.pop() || {
            src: null,
            data: {},
        };
        let removedKey: number = removedTrack.key || -1;
        return removedKey;
    }

    /**
     * Compares values in search with corresponding values in the tracks
     * of the queue. All the matches are removed.
     * @param {Object} search Object with values which should be compared.
     * @returns array of the keys of tracks removed
     */
    public remove(search: {
        key?: number;
        src?: URL;
        data?: Object;
    }): number[] {
        let removedKeys: number[] = [];
        this.queue.next = this.queue.next.filter(track => {
            let predicateVal = !this.recursiveCompare(track, search);
            if (!predicateVal) {
                removedKeys.push(track.key || -1);
            }
            return predicateVal;
        });
        return removedKeys;
    }

    /**
     * Clears the queue.
     */
    public clear(): void {
        this.queue.curr = { src: null, data: {} };
        this.queue.prev = [];
        this.queue.next = [];
    }

    /**
     * Advances the playlist
     * @returns {Track} the next track if exists, otherwise null
     */
    public next(): Track | null {
        if (this.queue.next.length == 0) return null;

        let index: number = 0;
        if (this.shufflePlaylist)
            index = Math.round(Math.random() * (this.queue.next.length - 1));

        this.queue.prev.push(this.queue.curr);
        this.queue.curr = this.queue.next[index];
        this.queue.next = [
            ...this.queue.next.slice(0, index),
            ...this.queue.next.slice(index + 1),
        ];
        return this.queue.curr;
    }

    /**
     * Checks if there are more tracks ahead.
     * @returns {boolean} true if no next tracks available
     */
    public get isNextEmpty(): boolean {
        return this.queue.next.length === 0;
    }

    /**
     * Retreats the playlist
     * @returns {Track} previous track
     */
    public prev(): Track {
        this.queue.next = [this.queue.curr, ...this.queue.next];
        this.queue.curr = this.queue.prev[this.queue.prev.length - 1];
        this.queue.prev.pop();
        return this.queue.curr;
    }

    /**
     * Checks if there are more tracks behind.
     * @returns {boolean} true if no previous available
     */
    public get isPrevEmpty(): boolean {
        return this.queue.prev.length === 0;
    }

    /**
     * Brings playlist to start.
     */
    public reset(): void {
        this.queue.prev = [
            ...this.queue.prev,
            this.queue.curr,
            ...this.queue.next,
        ];
        this.queue.curr = { src: null, data: {} };
        this.queue.next = [];
    }

    /**
     * Gets the current track data.
     */
    public get current(): Track {
        return this.queue.curr;
    }

    /**
     * Gets the playlist shuffle enabled/disabled state.
     */
    public get shuffle(): boolean {
        return this.shufflePlaylist;
    }

    /**
     * Sets the playlist shuffle enabled/disabled state.
     */
    public set shuffle(shuffleEnable: boolean) {
        this.shufflePlaylist = shuffleEnable;
    }
}

export default UncomplicatedPlayerQueue;
